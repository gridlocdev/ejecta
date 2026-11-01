#include "EJAudioMixerCore.h"
#include "EJAudioEffects.h"

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

// A route with its target resolved to a bus slot (-1 for the output)
typedef struct {
	int target, slot;
	float matrix[4];
} EJResolvedRoute;

enum { kVoiceFree = 0, kVoicePlaying, kVoiceEnded };

typedef struct {
	int state;
	int id;
	EJAudioBuffer *buffer;
	double position; // in buffer frames
	double rate;
	double loopStart, loopEnd; // in buffer frames
	int loop;
	EJResolvedRoute routes[EJ_AUDIO_MAX_ROUTES];
	int routeCount;
} EJAudioVoice;

typedef struct {
	int used, id, type, monoInput;
	float input[2][EJ_AUDIO_CHUNK];
	float pending[2][EJ_AUDIO_CHUNK]; // feedback for the next block
	int hasPending, ran;
	int ordered; // in the bus order, so it runs
	EJResolvedRoute routes[EJ_AUDIO_MAX_ROUTES];
	int routeCount;

	EJBiquad biquad;
	EJDelay delay;
	double maxDelaySeconds;
	float *curve;
	int curveLength;
	EJCompressor compressor;
	EJConvolver *convolver;
	int silentFrames, idle;
} EJAudioBus;

struct EJAudioMixer {
	atomic_flag lock;
	_Atomic double outputSampleRate;
	_Atomic double timeRendered; // written by the audio thread only

	EJAudioVoice *voices;
	int maxVoices;

	EJAudioBus *buses;
	int order[EJ_AUDIO_MAX_BUSES];
	int orderCount;

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

static int busSlot(EJAudioMixer *m, int busId) {
	if( busId <= 0 ) { return -1; }
	for( int i = 0; i < EJ_AUDIO_MAX_BUSES; i++ ) {
		if( m->buses[i].used && m->buses[i].id == busId ) { return i; }
	}
	return -1;
}

// Resolves targets to slots and drops routes to buses that don't exist
static int resolveRoutes(EJAudioMixer *m, const EJAudioRoute *routes, int count, EJResolvedRoute *out) {
	int n = 0;
	for( int i = 0; i < count && n < EJ_AUDIO_MAX_ROUTES; i++ ) {
		int slot = -1;
		if( routes[i].target != 0 ) {
			slot = busSlot(m, routes[i].target);
			if( slot < 0 ) { continue; }
		}
		out[n].target = routes[i].target;
		out[n].slot = slot;
		for( int k = 0; k < 4; k++ ) {
			float v = routes[i].matrix[k];
			out[n].matrix[k] = isfinite(v) ? v : 0;
		}
		n++;
	}
	return n;
}

// Loop points in buffer frames, as the Web Audio spec picks them
static void setLoop(EJAudioVoice *v, double loopStart, double loopEnd) {
	EJAudioBuffer *b = v->buffer;
	loopStart = finiteOr(loopStart, 0);
	loopEnd = finiteOr(loopEnd, 0);
	if( loopStart >= 0 && loopEnd > 0 && loopStart < loopEnd ) {
		v->loopStart = fmin(loopStart * b->sampleRate, b->length);
		v->loopEnd = fmin(loopEnd * b->sampleRate, b->length);
	}
	else {
		v->loopStart = 0;
		v->loopEnd = b->length;
	}
	if( v->loopEnd - v->loopStart < 1 ) {
		v->loopStart = 0;
		v->loopEnd = b->length;
	}
}


EJAudioMixer *EJAudioMixerCreate(double outputSampleRate, int maxVoices) {
	EJAudioMixer *m = calloc(1, sizeof(EJAudioMixer));
	if( !m ) { return NULL; }
	atomic_flag_clear(&m->lock);
	atomic_store(&m->outputSampleRate, outputSampleRate > 0 ? outputSampleRate : 44100);
	atomic_store(&m->timeRendered, 0.0);
	m->maxVoices = maxVoices > 0 ? maxVoices : 64;
	m->voices = calloc(m->maxVoices, sizeof(EJAudioVoice));
	m->buses = calloc(EJ_AUDIO_MAX_BUSES, sizeof(EJAudioBus));
	if( !m->voices || !m->buses ) {
		free(m->voices);
		free(m->buses);
		free(m);
		return NULL;
	}
	return m;
}

static void busFreeState(EJAudioBus *b) {
	EJDelayFree(&b->delay);
	free(b->curve);
	EJConvolverDestroy(b->convolver);
	b->curve = NULL;
	b->curveLength = 0;
	b->convolver = NULL;
}

void EJAudioMixerDestroy(EJAudioMixer *m) {
	if( !m ) { return; }
	for( int i = 0; i < m->maxVoices; i++ ) {
		if( m->voices[i].state != kVoiceFree ) { bufferRelease(m->voices[i].buffer); }
	}
	for( int i = 0; i < m->bufferCount; i++ ) {
		bufferRelease(m->buffers[i]);
	}
	for( int i = 0; i < EJ_AUDIO_MAX_BUSES; i++ ) {
		busFreeState(&m->buses[i]);
	}
	free(m->buffers);
	free(m->voices);
	free(m->buses);
	free(m);
}

void EJAudioMixerSetOutputSampleRate(EJAudioMixer *m, double outputSampleRate) {
	if( outputSampleRate > 0 && isfinite(outputSampleRate) ) {
		atomic_store(&m->outputSampleRate, outputSampleRate);
	}
}

double EJAudioMixerGetOutputSampleRate(EJAudioMixer *m) {
	return atomic_load(&m->outputSampleRate);
}


// Buffers ---------------------------------------------------------------------

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


// Voices ----------------------------------------------------------------------

int EJAudioMixerPlay(EJAudioMixer *m, int voiceId, int bufferId,
	double offsetSeconds, int loop, double loopStart, double loopEnd, double rate,
	const EJAudioRoute *routes, int routeCount
) {
	int index = bufferIndex(m, bufferId);
	if( index < 0 ) { return 0; }
	EJAudioBuffer *b = m->buffers[index];

	offsetSeconds = finiteOr(offsetSeconds, 0);
	double position = offsetSeconds > 0 ? offsetSeconds * b->sampleRate : 0;

	lock(m);
	EJAudioVoice *v = NULL;
	for( int i = 0; i < m->maxVoices; i++ ) {
		if( m->voices[i].state == kVoiceFree ) { v = &m->voices[i]; break; }
	}
	if( v ) {
		b->refCount++;
		v->id = voiceId;
		v->buffer = b;
		v->rate = finiteOr(rate, 0) > 0 ? rate : 0;
		v->loop = loop;
		setLoop(v, loopStart, loopEnd);
		if( loop && position >= v->loopEnd ) {
			position = v->loopStart + fmod(position - v->loopStart, v->loopEnd - v->loopStart);
		}
		v->position = position;
		v->routeCount = resolveRoutes(m, routes, routeCount, v->routes);
		// Starting past the end of a one-shot is a voice that ends at once
		v->state = position >= b->length ? kVoiceEnded : kVoicePlaying;
	}
	unlock(m);
	return v != NULL;
}

void EJAudioMixerUpdate(EJAudioMixer *m, int voiceId,
	int loop, double loopStart, double loopEnd, double rate,
	const EJAudioRoute *routes, int routeCount
) {
	lock(m);
	EJAudioVoice *v = findVoice(m, voiceId);
	if( v ) {
		v->loop = loop;
		v->rate = finiteOr(rate, 0) > 0 ? rate : 0;
		setLoop(v, loopStart, loopEnd);
		v->routeCount = resolveRoutes(m, routes, routeCount, v->routes);
	}
	unlock(m);
}

void EJAudioMixerStop(EJAudioMixer *m, int voiceId) {
	lock(m);
	EJAudioVoice *v = findVoice(m, voiceId);
	if( v ) { v->state = kVoiceEnded; }
	unlock(m);
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

int EJAudioMixerActiveVoices(EJAudioMixer *m) {
	int count = 0;
	lock(m);
	for( int i = 0; i < m->maxVoices; i++ ) {
		if( m->voices[i].state == kVoicePlaying ) { count++; }
	}
	unlock(m);
	return count;
}


// Buses -----------------------------------------------------------------------

int EJAudioMixerSetBus(EJAudioMixer *m, int busId, int type, double maxDelaySeconds, int monoInput) {
	if( busId <= 0 || type < kEJAudioBusNone || type > kEJAudioBusConvolver ) { return 0; }
	maxDelaySeconds = finiteOr(maxDelaySeconds, 1);
	if( maxDelaySeconds < 0 ) { maxDelaySeconds = 0; }
	if( maxDelaySeconds > 180 ) { maxDelaySeconds = 180; }

	int slot = busSlot(m, busId);
	EJAudioBus *b = slot >= 0 ? &m->buses[slot] : NULL;
	int needsDelay = type == kEJAudioBusDelay &&
		(!b || b->type != kEJAudioBusDelay || b->maxDelaySeconds != maxDelaySeconds);

	// Allocate before taking the lock
	EJDelay delay = {0};
	if( needsDelay ) {
		int frames = (int)ceil(maxDelaySeconds * EJAudioMixerGetOutputSampleRate(m));
		if( !EJDelayInit(&delay, frames) ) { return 0; }
	}

	EJAudioBus old;
	memset(&old, 0, sizeof(old));
	int hasOld = 0;
	lock(m);
	if( !b ) {
		for( int i = 0; i < EJ_AUDIO_MAX_BUSES; i++ ) {
			if( !m->buses[i].used ) { b = &m->buses[i]; break; }
		}
		if( !b ) {
			unlock(m);
			EJDelayFree(&delay);
			return 0;
		}
		memset(b, 0, sizeof(EJAudioBus));
		b->used = 1;
		b->id = busId;
		b->type = -1;
	}
	if( b->type != type || needsDelay ) {
		// Keep the old state to free after unlocking
		old = *b;
		hasOld = b->type >= 0;
		b->delay = delay;
		b->curve = NULL;
		b->curveLength = 0;
		b->convolver = NULL;
		memset(&b->biquad, 0, sizeof(b->biquad));
		b->biquad.b0 = 1;
		memset(&b->compressor, 0, sizeof(b->compressor));
		EJCompressorSetup(&b->compressor, -24, 30, 12, .003f, .25f);
		b->type = type;
		b->maxDelaySeconds = maxDelaySeconds;
		b->idle = 0;
		b->silentFrames = 0;
	}
	b->monoInput = monoInput;
	unlock(m);

	if( hasOld ) {
		// Only what was replaced: a curve or convolver of the same type stays
		if( old.type == kEJAudioBusDelay || needsDelay ) { EJDelayFree(&old.delay); }
		if( old.curve != b->curve ) { free(old.curve); }
		if( old.convolver != b->convolver ) { EJConvolverDestroy(old.convolver); }
	}
	return 1;
}

void EJAudioMixerDeleteBus(EJAudioMixer *m, int busId) {
	int slot = busSlot(m, busId);
	if( slot < 0 ) { return; }

	lock(m);
	EJAudioBus *b = &m->buses[slot];
	EJAudioBus old = *b;
	b->used = 0;
	b->delay.line[0] = b->delay.line[1] = NULL;
	b->curve = NULL;
	b->convolver = NULL;

	// Drop every route to it, and its place in the order
	for( int i = 0; i < m->maxVoices; i++ ) {
		EJAudioVoice *v = &m->voices[i];
		int n = 0;
		for( int r = 0; r < v->routeCount; r++ ) {
			if( v->routes[r].slot != slot ) { v->routes[n++] = v->routes[r]; }
		}
		v->routeCount = n;
	}
	for( int i = 0; i < EJ_AUDIO_MAX_BUSES; i++ ) {
		EJAudioBus *other = &m->buses[i];
		int n = 0;
		for( int r = 0; r < other->routeCount; r++ ) {
			if( other->routes[r].slot != slot ) { other->routes[n++] = other->routes[r]; }
		}
		other->routeCount = n;
	}
	int n = 0;
	for( int i = 0; i < m->orderCount; i++ ) {
		if( m->order[i] != slot ) { m->order[n++] = m->order[i]; }
	}
	m->orderCount = n;
	b->ordered = 0;
	unlock(m);

	busFreeState(&old);
}

void EJAudioMixerSetBusParams(EJAudioMixer *m, int busId, const double *p, int count) {
	int slot = busSlot(m, busId);
	if( slot < 0 ) { return; }
	EJAudioBus *b = &m->buses[slot];
	double rate = EJAudioMixerGetOutputSampleRate(m);

	if( b->type == kEJAudioBusBiquad && count >= 5 ) {
		EJBiquad coefficients;
		EJBiquadSetup(&coefficients, (int)finiteOr(p[0], 0), rate, p[1], p[2], p[3], p[4]);
		lock(m);
		b->biquad.b0 = coefficients.b0; b->biquad.b1 = coefficients.b1; b->biquad.b2 = coefficients.b2;
		b->biquad.a1 = coefficients.a1; b->biquad.a2 = coefficients.a2;
		unlock(m);
	}
	else if( b->type == kEJAudioBusDelay && count >= 1 ) {
		lock(m);
		b->delay.delayFrames = finiteOr(p[0], 0) * rate;
		unlock(m);
	}
	else if( b->type == kEJAudioBusCompressor && count >= 5 ) {
		EJCompressor settings = {0};
		EJCompressorSetup(&settings, (float)p[0], (float)p[1], (float)p[2], (float)p[3], (float)p[4]);
		lock(m);
		settings.gainDb = b->compressor.gainDb;
		b->compressor = settings;
		unlock(m);
	}
}

void EJAudioMixerSetBusCurve(EJAudioMixer *m, int busId, const float *curve, int length) {
	int slot = busSlot(m, busId);
	if( slot < 0 ) { return; }
	float *copy = NULL;
	if( curve && length > 0 ) {
		copy = malloc(sizeof(float) * length);
		if( !copy ) { return; }
		for( int i = 0; i < length; i++ ) { copy[i] = isfinite(curve[i]) ? curve[i] : 0; }
	}
	lock(m);
	EJAudioBus *b = &m->buses[slot];
	float *old = b->curve;
	b->curve = copy;
	b->curveLength = copy ? length : 0;
	unlock(m);
	free(old);
}

void EJAudioMixerSetBusImpulse(EJAudioMixer *m, int busId,
	const float *const *channels, int channelCount, int length, float scale
) {
	int slot = busSlot(m, busId);
	if( slot < 0 ) { return; }
	EJConvolver *convolver = (channels && length > 0)
		? EJConvolverCreate(channels, channelCount, length, scale)
		: NULL;
	lock(m);
	EJAudioBus *b = &m->buses[slot];
	EJConvolver *old = b->convolver;
	b->convolver = convolver;
	b->idle = 0;
	b->silentFrames = 0;
	unlock(m);
	EJConvolverDestroy(old);
}

void EJAudioMixerSetBusRoutes(EJAudioMixer *m, int busId, const EJAudioRoute *routes, int routeCount) {
	int slot = busSlot(m, busId);
	if( slot < 0 ) { return; }
	EJResolvedRoute resolved[EJ_AUDIO_MAX_ROUTES];
	int n = resolveRoutes(m, routes, routeCount, resolved);
	lock(m);
	EJAudioBus *b = &m->buses[slot];
	memcpy(b->routes, resolved, sizeof(EJResolvedRoute) * n);
	b->routeCount = n;
	unlock(m);
}

void EJAudioMixerSetBusOrder(EJAudioMixer *m, const int *busIds, int count) {
	int order[EJ_AUDIO_MAX_BUSES];
	int n = 0;
	for( int i = 0; i < count && n < EJ_AUDIO_MAX_BUSES; i++ ) {
		int slot = busSlot(m, busIds[i]);
		if( slot >= 0 ) { order[n++] = slot; }
	}
	lock(m);
	int wasOrdered[EJ_AUDIO_MAX_BUSES];
	for( int i = 0; i < EJ_AUDIO_MAX_BUSES; i++ ) {
		wasOrdered[i] = m->buses[i].ordered;
		m->buses[i].ordered = 0;
	}
	for( int i = 0; i < n; i++ ) {
		EJAudioBus *b = &m->buses[order[i]];
		if( !wasOrdered[order[i]] ) {
			// Starts clean: nothing sent to it while it wasn't running
			memset(b->pending, 0, sizeof(b->pending));
			b->hasPending = 0;
		}
		b->ordered = 1;
	}
	// A bus listed twice runs once
	int unique = 0;
	for( int i = 0; i < n; i++ ) {
		int seen = 0;
		for( int k = 0; k < unique; k++ ) { if( order[k] == order[i] ) { seen = 1; break; } }
		if( !seen ) { order[unique++] = order[i]; }
	}
	memcpy(m->order, order, sizeof(int) * unique);
	m->orderCount = unique;
	unlock(m);
}

double EJAudioMixerGetBusReduction(EJAudioMixer *m, int busId) {
	int slot = busSlot(m, busId);
	if( slot < 0 || m->buses[slot].type != kEJAudioBusCompressor ) { return 0; }
	lock(m);
	double reduction = m->buses[slot].compressor.gainDb;
	unlock(m);
	return reduction;
}


// Rendering -------------------------------------------------------------------

// Adds a stereo block through a route into the output or a bus
static void sendTo(EJAudioMixer *m, const EJResolvedRoute *route,
	const float *inL, const float *inR, int frames, float *outL, float *outR
) {
	float *destL, *destR;
	if( route->slot < 0 ) {
		destL = outL;
		destR = outR;
	}
	else {
		EJAudioBus *bus = &m->buses[route->slot];
		if( !bus->used || !bus->ordered || bus->id != route->target ) { return; }
		if( bus->ran ) {
			destL = bus->pending[0];
			destR = bus->pending[1];
			bus->hasPending = 1;
		}
		else {
			destL = bus->input[0];
			destR = bus->input[1];
		}
	}
	const float m0 = route->matrix[0], m1 = route->matrix[1];
	const float m2 = route->matrix[2], m3 = route->matrix[3];
	for( int f = 0; f < frames; f++ ) {
		destL[f] += m0 * inL[f] + m1 * inR[f];
		destR[f] += m2 * inL[f] + m3 * inR[f];
	}
}

// Renders up to EJ_AUDIO_CHUNK frames of a voice, unmixed
static void renderVoice(EJAudioVoice *v, float *outL, float *outR, int frames, double outputRate) {
	EJAudioBuffer *b = v->buffer;
	const float *inL = b->channels[0];
	const float *inR = b->channelCount > 1 ? b->channels[1] : NULL;
	const int length = b->length;
	const double step = v->rate * b->sampleRate / outputRate;
	const double loopStart = v->loopStart, loopEnd = v->loopEnd;
	const int loopStartIndex = (int)loopStart;
	double position = v->position;

	int f = 0;
	for( ; f < frames; f++ ) {
		if( v->loop ) {
			if( position >= loopEnd ) {
				position = loopStart + fmod(position - loopStart, loopEnd - loopStart);
			}
		}
		else if( position >= length ) {
			v->state = kVoiceEnded;
			break;
		}

		// Linear interpolation; past the end of a loop, read its start
		int i0 = (int)position;
		int i1 = i0 + 1;
		if( v->loop && i1 >= loopEnd ) { i1 = loopStartIndex; }
		if( i1 >= length ) { i1 = v->loop ? loopStartIndex : i0; }
		float t = (float)(position - i0);

		outL[f] = inL[i0] + (inL[i1] - inL[i0]) * t;
		outR[f] = inR ? inR[i0] + (inR[i1] - inR[i0]) * t : 0;
		position += step;
	}
	for( ; f < frames; f++ ) {
		outL[f] = outR[f] = 0;
	}
	// A one-shot that reached its end exactly on the last frame ends now
	if( v->state == kVoicePlaying && !v->loop && position >= length ) {
		v->state = kVoiceEnded;
	}
	v->position = position;
}

static int isSilent(const float *l, const float *r, int frames) {
	for( int f = 0; f < frames; f++ ) {
		if( l[f] != 0 || r[f] != 0 ) { return 0; }
	}
	return 1;
}

static void runBus(EJAudioBus *b, int frames, double outputRate) {
	float *l = b->input[0], *r = b->input[1];
	switch( b->type ) {
		case kEJAudioBusBiquad:
			EJBiquadProcess(&b->biquad, l, r, frames);
			break;
		case kEJAudioBusDelay:
			EJDelayProcess(&b->delay, l, r, frames);
			break;
		case kEJAudioBusWaveShaper:
			EJWaveShaperProcess(b->curve, b->curveLength, l, r, frames);
			break;
		case kEJAudioBusCompressor:
			EJCompressorProcess(&b->compressor, l, r, frames, outputRate);
			break;
		case kEJAudioBusConvolver:
			if( !b->convolver ) {
				memset(l, 0, sizeof(float) * frames);
				memset(r, 0, sizeof(float) * frames);
				break;
			}
			// Skip the FFTs once the tail has died out
			if( isSilent(l, r, frames) ) {
				b->silentFrames += frames;
				if( b->silentFrames > EJConvolverTailFrames(b->convolver) ) {
					if( !b->idle ) { EJConvolverReset(b->convolver); b->idle = 1; }
					break;
				}
			}
			else {
				b->silentFrames = 0;
				b->idle = 0;
			}
			EJConvolverProcess(b->convolver, l, r, frames, b->monoInput);
			break;
	}
}

void EJAudioMixerRender(EJAudioMixer *m, float *left, float *right, int frameCount) {
	memset(left, 0, sizeof(float) * frameCount);
	memset(right, 0, sizeof(float) * frameCount);
	double outputRate = atomic_load_explicit(&m->outputSampleRate, memory_order_relaxed);
	double time = atomic_load_explicit(&m->timeRendered, memory_order_relaxed);

	// The audio thread must not wait: if the JS thread holds the lock right
	// now, this block stays silent and voices pick up on the next one.
	if( atomic_flag_test_and_set_explicit(&m->lock, memory_order_acquire) ) {
		atomic_store_explicit(&m->timeRendered, time + frameCount / outputRate, memory_order_relaxed);
		return;
	}

	float voiceL[EJ_AUDIO_CHUNK], voiceR[EJ_AUDIO_CHUNK];
	for( int offset = 0; offset < frameCount; offset += EJ_AUDIO_CHUNK ) {
		int frames = frameCount - offset < EJ_AUDIO_CHUNK ? frameCount - offset : EJ_AUDIO_CHUNK;
		float *outL = left + offset, *outR = right + offset;

		// Bus inputs start with the feedback sent to them last block
		for( int i = 0; i < m->orderCount; i++ ) {
			EJAudioBus *b = &m->buses[m->order[i]];
			if( b->hasPending ) {
				memcpy(b->input, b->pending, sizeof(b->input));
				memset(b->pending, 0, sizeof(b->pending));
				b->hasPending = 0;
			}
			else {
				memset(b->input, 0, sizeof(b->input));
			}
			b->ran = 0;
		}

		for( int i = 0; i < m->maxVoices; i++ ) {
			EJAudioVoice *v = &m->voices[i];
			if( v->state != kVoicePlaying ) { continue; }
			renderVoice(v, voiceL, voiceR, frames, outputRate);
			for( int r = 0; r < v->routeCount; r++ ) {
				sendTo(m, &v->routes[r], voiceL, voiceR, frames, outL, outR);
			}
		}

		for( int i = 0; i < m->orderCount; i++ ) {
			EJAudioBus *b = &m->buses[m->order[i]];
			runBus(b, frames, outputRate);
			b->ran = 1;
			for( int r = 0; r < b->routeCount; r++ ) {
				sendTo(m, &b->routes[r], b->input[0], b->input[1], frames, outL, outR);
			}
		}
	}
	unlock(m);

	atomic_store_explicit(&m->timeRendered, time + frameCount / outputRate, memory_order_relaxed);
}

double EJAudioMixerGetTime(EJAudioMixer *m) {
	return atomic_load_explicit(&m->timeRendered, memory_order_relaxed);
}
