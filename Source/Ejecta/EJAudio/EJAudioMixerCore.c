#include "EJAudioMixerCore.h"

#include <math.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
	int id;
	int channelCount; // 1 or 2; extra channels are dropped
	int length;
	double sampleRate;
	float *channels[2];
	int refCount; // voices using it, plus 1 while it is registered
} EJAudioBuffer;

enum { kVoiceFree = 0, kVoicePlaying, kVoiceEnded };

typedef struct {
	int state;
	int id;
	EJAudioBuffer *buffer;
	double position; // in buffer frames
	double rate;
	int loop;
	float matrix[4];
} EJAudioVoice;

struct EJAudioMixer {
	atomic_flag lock;
	_Atomic double outputSampleRate;
	_Atomic double timeRendered; // written by the audio thread only

	EJAudioVoice *voices;
	int maxVoices;

	// Registered buffers, touched by the JS thread only
	EJAudioBuffer **buffers;
	int bufferCount, bufferCapacity;
};

static void lock(EJAudioMixer *m) {
	while( atomic_flag_test_and_set_explicit(&m->lock, memory_order_acquire) ) {}
}

static void unlock(EJAudioMixer *m) {
	atomic_flag_clear_explicit(&m->lock, memory_order_release);
}

// Values from JavaScript can be NaN or infinite; never let them reach the mix
static double finiteOr(double v, double otherwise) {
	return isfinite(v) ? v : otherwise;
}

static void copyMatrix(float dest[4], const float source[4]) {
	for( int i = 0; i < 4; i++ ) {
		dest[i] = isfinite(source[i]) ? source[i] : 0;
	}
}

static void bufferRelease(EJAudioBuffer *b) {
	if( --b->refCount > 0 ) { return; }
	for( int i = 0; i < b->channelCount; i++ ) {
		free(b->channels[i]);
	}
	free(b);
}

static int bufferIndex(EJAudioMixer *m, int bufferId) {
	for( int i = 0; i < m->bufferCount; i++ ) {
		if( m->buffers[i]->id == bufferId ) { return i; }
	}
	return -1;
}

static EJAudioVoice *findVoice(EJAudioMixer *m, int voiceId) {
	for( int i = 0; i < m->maxVoices; i++ ) {
		if( m->voices[i].state == kVoicePlaying && m->voices[i].id == voiceId ) {
			return &m->voices[i];
		}
	}
	return NULL;
}


EJAudioMixer *EJAudioMixerCreate(double outputSampleRate, int maxVoices) {
	EJAudioMixer *m = calloc(1, sizeof(EJAudioMixer));
	if( !m ) { return NULL; }
	atomic_flag_clear(&m->lock);
	atomic_store(&m->outputSampleRate, outputSampleRate > 0 ? outputSampleRate : 44100);
	atomic_store(&m->timeRendered, 0.0);
	m->maxVoices = maxVoices > 0 ? maxVoices : 64;
	m->voices = calloc(m->maxVoices, sizeof(EJAudioVoice));
	if( !m->voices ) { free(m); return NULL; }
	return m;
}

void EJAudioMixerDestroy(EJAudioMixer *m) {
	if( !m ) { return; }
	for( int i = 0; i < m->maxVoices; i++ ) {
		if( m->voices[i].state != kVoiceFree ) { bufferRelease(m->voices[i].buffer); }
	}
	for( int i = 0; i < m->bufferCount; i++ ) {
		bufferRelease(m->buffers[i]);
	}
	free(m->buffers);
	free(m->voices);
	free(m);
}

void EJAudioMixerSetOutputSampleRate(EJAudioMixer *m, double outputSampleRate) {
	if( outputSampleRate > 0 ) {
		atomic_store(&m->outputSampleRate, outputSampleRate);
	}
}

double EJAudioMixerGetOutputSampleRate(EJAudioMixer *m) {
	return atomic_load(&m->outputSampleRate);
}

int EJAudioMixerSetBuffer(EJAudioMixer *m, int bufferId,
	const float *const *channels, int channelCount, int length, double sampleRate
) {
	if( channelCount < 1 || length < 1 || !isfinite(sampleRate) || sampleRate <= 0 ) { return 0; }

	EJAudioBuffer *b = calloc(1, sizeof(EJAudioBuffer));
	if( !b ) { return 0; }
	b->id = bufferId;
	b->channelCount = channelCount > 2 ? 2 : channelCount;
	b->length = length;
	b->sampleRate = sampleRate;
	b->refCount = 1;
	for( int i = 0; i < b->channelCount; i++ ) {
		b->channels[i] = malloc(sizeof(float) * length);
		if( !b->channels[i] ) {
			b->channelCount = i;
			bufferRelease(b);
			return 0;
		}
		memcpy(b->channels[i], channels[i], sizeof(float) * length);
	}

	int index = bufferIndex(m, bufferId);
	if( index >= 0 ) {
		bufferRelease(m->buffers[index]);
		m->buffers[index] = b;
		return 1;
	}

	if( m->bufferCount == m->bufferCapacity ) {
		int capacity = m->bufferCapacity ? m->bufferCapacity * 2 : 32;
		EJAudioBuffer **grown = realloc(m->buffers, sizeof(EJAudioBuffer *) * capacity);
		if( !grown ) { bufferRelease(b); return 0; }
		m->buffers = grown;
		m->bufferCapacity = capacity;
	}
	m->buffers[m->bufferCount++] = b;
	return 1;
}

void EJAudioMixerDeleteBuffer(EJAudioMixer *m, int bufferId) {
	int index = bufferIndex(m, bufferId);
	if( index < 0 ) { return; }
	EJAudioBuffer *b = m->buffers[index];
	m->buffers[index] = m->buffers[--m->bufferCount];
	bufferRelease(b); // freed now, or when the last voice playing it ends
}

int EJAudioMixerPlay(EJAudioMixer *m, int voiceId, int bufferId,
	double offsetSeconds, int loop, double rate, const float matrix[4]
) {
	int index = bufferIndex(m, bufferId);
	if( index < 0 ) { return 0; }
	EJAudioBuffer *b = m->buffers[index];

	offsetSeconds = finiteOr(offsetSeconds, 0);
	double position = offsetSeconds > 0 ? offsetSeconds * b->sampleRate : 0;
	if( loop ) {
		position = fmod(position, b->length);
	}

	lock(m);
	EJAudioVoice *v = NULL;
	for( int i = 0; i < m->maxVoices; i++ ) {
		if( m->voices[i].state == kVoiceFree ) { v = &m->voices[i]; break; }
	}
	if( v ) {
		b->refCount++;
		v->id = voiceId;
		v->buffer = b;
		v->position = position;
		v->rate = finiteOr(rate, 0) > 0 ? rate : 0;
		v->loop = loop;
		copyMatrix(v->matrix, matrix);
		// Starting past the end of a one-shot is a voice that ends at once
		v->state = position >= b->length ? kVoiceEnded : kVoicePlaying;
	}
	unlock(m);
	return v != NULL;
}

void EJAudioMixerUpdate(EJAudioMixer *m, int voiceId, int loop, double rate, const float matrix[4]) {
	lock(m);
	EJAudioVoice *v = findVoice(m, voiceId);
	if( v ) {
		v->loop = loop;
		v->rate = finiteOr(rate, 0) > 0 ? rate : 0;
		copyMatrix(v->matrix, matrix);
	}
	unlock(m);
}

void EJAudioMixerStop(EJAudioMixer *m, int voiceId) {
	lock(m);
	EJAudioVoice *v = findVoice(m, voiceId);
	if( v ) { v->state = kVoiceEnded; }
	unlock(m);
}

void EJAudioMixerRender(EJAudioMixer *m, float *left, float *right, int frameCount) {
	memset(left, 0, sizeof(float) * frameCount);
	memset(right, 0, sizeof(float) * frameCount);
	double outputRate = atomic_load_explicit(&m->outputSampleRate, memory_order_relaxed);

	// The audio thread must not wait: if the JS thread holds the lock right
	// now, this block stays silent and voices pick up on the next one.
	if( atomic_flag_test_and_set_explicit(&m->lock, memory_order_acquire) ) {
		double time = atomic_load_explicit(&m->timeRendered, memory_order_relaxed);
		atomic_store_explicit(&m->timeRendered, time + frameCount / outputRate, memory_order_relaxed);
		return;
	}
	for( int i = 0; i < m->maxVoices; i++ ) {
		EJAudioVoice *v = &m->voices[i];
		if( v->state != kVoicePlaying ) { continue; }

		EJAudioBuffer *b = v->buffer;
		const float *inL = b->channels[0];
		const float *inR = b->channelCount > 1 ? b->channels[1] : NULL;
		const int length = b->length;
		const double step = v->rate * b->sampleRate / outputRate;
		const float m0 = v->matrix[0], m1 = v->matrix[1], m2 = v->matrix[2], m3 = v->matrix[3];
		double position = v->position;

		for( int f = 0; f < frameCount; f++ ) {
			if( position >= length ) {
				if( !v->loop ) { v->state = kVoiceEnded; break; }
				position = fmod(position, length);
			}

			// Linear interpolation; past the last sample, a loop reads its start
			int i0 = (int)position;
			int i1 = i0 + 1;
			if( i1 >= length ) { i1 = v->loop ? 0 : i0; }
			float t = (float)(position - i0);

			float l = inL[i0] + (inL[i1] - inL[i0]) * t;
			float r = inR ? inR[i0] + (inR[i1] - inR[i0]) * t : 0;
			left[f] += m0 * l + m1 * r;
			right[f] += m2 * l + m3 * r;

			position += step;
		}
		// A one-shot that reached its end exactly on the last frame ends now
		if( v->state == kVoicePlaying && !v->loop && position >= length ) {
			v->state = kVoiceEnded;
		}
		v->position = position;
	}
	unlock(m);

	double time = atomic_load_explicit(&m->timeRendered, memory_order_relaxed);
	atomic_store_explicit(&m->timeRendered, time + frameCount / outputRate, memory_order_relaxed);
}

int EJAudioMixerTakeEnded(EJAudioMixer *m, int *ids, int maxIds) {
	// Buffers are released after unlocking, so the audio thread never waits
	// on free()
	EJAudioBuffer *released[256];
	if( maxIds > 256 ) { maxIds = 256; }
	
	int count = 0;
	lock(m);
	for( int i = 0; i < m->maxVoices && count < maxIds; i++ ) {
		EJAudioVoice *v = &m->voices[i];
		if( v->state != kVoiceEnded ) { continue; }
		ids[count] = v->id;
		released[count] = v->buffer;
		count++;
		v->state = kVoiceFree;
		v->buffer = NULL;
	}
	unlock(m);
	
	for( int i = 0; i < count; i++ ) {
		bufferRelease(released[i]);
	}
	return count;
}

double EJAudioMixerGetTime(EJAudioMixer *m) {
	return atomic_load_explicit(&m->timeRendered, memory_order_relaxed);
}

int EJAudioMixerActiveVoices(EJAudioMixer *m) {
	int count = 0;
	lock(m);
	for( int i = 0; i < m->maxVoices; i++ ) {
		if( m->voices[i].state == kVoicePlaying ) { count++; }
	}
	unlock(m);
	return count;
}
