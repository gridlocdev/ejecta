// Tests for Source/Ejecta/EJAudio/EJAudioMixerCore.c. Runs on any machine:
//   just test-mixer
#include "EJAudioMixerCore.h"

#include <math.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>

static int failures = 0;
#define CHECK(cond, ...) do { if( !(cond) ) { failures++; \
	printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while(0)
#define NEAR(a, b) (fabs((a) - (b)) < 1e-4)

#include "EJAudioEffects.h"

static const float center[4] = {1, 0, 1, 0}; // mono to both speakers

// One route to the output through a matrix
static EJAudioRoute out(const float m[4]) {
	EJAudioRoute r = {0, {m[0], m[1], m[2], m[3]}};
	return r;
}
static EJAudioRoute to(int bus, float m0, float m1, float m2, float m3) {
	EJAudioRoute r = {bus, {m0, m1, m2, m3}};
	return r;
}
static int play(EJAudioMixer *m, int voice, int buffer, double offset, int loop, double rate, const float matrix[4]) {
	EJAudioRoute r = out(matrix);
	return EJAudioMixerPlay(m, voice, buffer, offset, loop, 0, 0, rate, &r, 1);
}
static void update(EJAudioMixer *m, int voice, int loop, double rate, const float matrix[4]) {
	EJAudioRoute r = out(matrix);
	EJAudioMixerUpdate(m, voice, loop, 0, 0, rate, &r, 1);
}
static float L[4096], R[4096];

static void render(EJAudioMixer *m, int frames) { EJAudioMixerRender(m, L, R, frames); }

static int ended(EJAudioMixer *m, int *id) {
	int ids[64];
	int n = EJAudioMixerTakeEnded(m, ids, 64);
	if( n && id ) { *id = ids[0]; }
	return n;
}

static void testMonoConstant(void) {
	EJAudioMixer *m = EJAudioMixerCreate(44100, 8);
	float data[100];
	for( int i = 0; i < 100; i++ ) { data[i] = .5f; }
	const float *ch[] = {data};
	CHECK(EJAudioMixerSetBuffer(m, 1, ch, 1, 100, 44100), "set buffer");
	CHECK(play(m, 7, 1, 0, 0, 1, center), "play");

	render(m, 64);
	CHECK(NEAR(L[0], .5) && NEAR(R[63], .5), "mono plays on both sides: %f %f", L[0], R[63]);
	CHECK(ended(m, NULL) == 0, "not ended after 64 of 100 frames");

	render(m, 64);
	CHECK(NEAR(L[35], .5) && NEAR(L[36], 0), "stops after 100 frames: %f %f", L[35], L[36]);
	int id = 0;
	CHECK(ended(m, &id) == 1 && id == 7, "ended reported once with its id");
	CHECK(ended(m, NULL) == 0, "ended only reported once");
	CHECK(NEAR(EJAudioMixerGetTime(m), 128.0 / 44100), "time follows frames rendered");
	EJAudioMixerDestroy(m);
}

static void testResampleAndRate(void) {
	EJAudioMixer *m = EJAudioMixerCreate(48000, 8);
	float data[24000]; // one second at 24 kHz
	for( int i = 0; i < 24000; i++ ) { data[i] = (float)i / 24000; }
	const float *ch[] = {data};
	EJAudioMixerSetBuffer(m, 1, ch, 1, 24000, 24000);
	play(m, 1, 1, .5, 0, 1, center); // from the middle
	render(m, 2);
	CHECK(NEAR(L[0], .5) && NEAR(L[1], .5 + .5 / 24000), "offset and half steps: %f %f", L[0], L[1]);

	// Half a second left at 48 kHz output is 24000 frames; at rate 2, 12000
	update(m, 1, 0, 2, center);
	int frames = 2, done = 0;
	while( !done && frames < 50000 ) { render(m, 1000); frames += 1000; done = ended(m, NULL); }
	CHECK(frames >= 12000 && frames <= 13002, "rate 2 plays the rest in about 12000 frames: %d", frames);
	EJAudioMixerDestroy(m);
}

static void testStereoMatrix(void) {
	EJAudioMixer *m = EJAudioMixerCreate(44100, 8);
	float l[10], r[10];
	for( int i = 0; i < 10; i++ ) { l[i] = .25f; r[i] = .75f; }
	const float *ch[] = {l, r};
	EJAudioMixerSetBuffer(m, 1, ch, 2, 10, 44100);
	const float swap[4] = {0, 1, 1, 0};
	play(m, 1, 1, 0, 0, 1, swap);
	const float half[4] = {.5f, 0, 0, .5f};
	play(m, 2, 1, 0, 0, 1, half);
	render(m, 4);
	CHECK(NEAR(L[0], .75 + .125) && NEAR(R[0], .25 + .375), "matrix mixes channels and voices add: %f %f", L[0], R[0]);
	EJAudioMixerDestroy(m);
}

static void testLoopStopAndLimits(void) {
	EJAudioMixer *m = EJAudioMixerCreate(44100, 2);
	float data[10] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9};
	const float *ch[] = {data};
	EJAudioMixerSetBuffer(m, 1, ch, 1, 10, 44100);
	CHECK(play(m, 1, 1, 0, 1, 1, center), "loop plays");
	render(m, 25);
	CHECK(NEAR(L[9], 9) && NEAR(L[10], 0) && NEAR(L[24], 4), "loop wraps: %f %f %f", L[9], L[10], L[24]);
	CHECK(ended(m, NULL) == 0, "a loop doesn't end");

	CHECK(play(m, 2, 1, 0, 0, 1, center), "second voice");
	CHECK(!play(m, 3, 1, 0, 0, 1, center), "no third voice with 2 slots");
	CHECK(!play(m, 4, 99, 0, 0, 1, center), "unknown buffer");

	EJAudioMixerStop(m, 1);
	int id = 0;
	CHECK(ended(m, &id) == 1 && id == 1, "stopped voice reported as ended");
	CHECK(EJAudioMixerActiveVoices(m) == 1, "one voice left");

	CHECK(play(m, 5, 1, 2.0, 0, 1, center), "offset past the end still starts");
	CHECK(ended(m, &id) == 1 && id == 5, "and ends at once");
	EJAudioMixerDestroy(m);
}

static void testReplaceAndDeleteWhilePlaying(void) {
	EJAudioMixer *m = EJAudioMixerCreate(44100, 4);
	float a[1000], b[1000];
	for( int i = 0; i < 1000; i++ ) { a[i] = 1; b[i] = 2; }
	const float *cha[] = {a}, *chb[] = {b};
	EJAudioMixerSetBuffer(m, 1, cha, 1, 1000, 44100);
	play(m, 1, 1, 0, 0, 1, center);
	EJAudioMixerSetBuffer(m, 1, chb, 1, 1000, 44100);
	play(m, 2, 1, 0, 0, 1, center);
	render(m, 10);
	CHECK(NEAR(L[0], 3), "old voice keeps old samples, new voice gets new: %f", L[0]);
	EJAudioMixerDeleteBuffer(m, 1);
	render(m, 2000); // both end; buffers freed on take (ASan checks)
	CHECK(ended(m, NULL) == 2, "both end");
	CHECK(!play(m, 3, 1, 0, 0, 1, center), "deleted buffer can't play");
	EJAudioMixerDestroy(m);
}

static void testNonFiniteInput(void) {
	EJAudioMixer *m = EJAudioMixerCreate(44100, 4);
	float data[100];
	for( int i = 0; i < 100; i++ ) { data[i] = .5f; }
	const float *ch[] = {data};
	CHECK(!EJAudioMixerSetBuffer(m, 1, ch, 1, 100, INFINITY), "infinite sample rate rejected");
	CHECK(!EJAudioMixerSetBuffer(m, 1, ch, 1, 100, NAN), "NaN sample rate rejected");
	EJAudioMixerSetBuffer(m, 1, ch, 1, 100, 44100);
	const float bad[4] = {NAN, INFINITY, 1, -INFINITY};
	CHECK(play(m, 1, 1, NAN, 1, INFINITY, bad), "plays with bad values");
	render(m, 16);
	CHECK(isfinite(L[0]) && isfinite(R[0]) && NEAR(R[0], .5) && NEAR(L[0], 0),
		"NaN and infinity become 0: %f %f", L[0], R[0]);
	update(m, 1, 1, NAN, bad);
	render(m, 16);
	CHECK(isfinite(L[5]) && isfinite(R[5]), "update with NaN stays finite");
	EJAudioMixerDestroy(m);
}

static float ones[48000];

static void testLoopPoints(void) {
	EJAudioMixer *m = EJAudioMixerCreate(10, 4); // 10 Hz output: one frame per sample
	float data[10] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9};
	const float *ch[] = {data};
	EJAudioMixerSetBuffer(m, 1, ch, 1, 10, 10);
	EJAudioRoute r = out(center);
	EJAudioMixerPlay(m, 1, 1, 0, 1, .4, .7, 1, &r, 1); // loop samples 4..6
	render(m, 12);
	CHECK(NEAR(L[3], 3) && NEAR(L[6], 6) && NEAR(L[7], 4) && NEAR(L[10], 4),
		"plays in, then loops 4..6: %f %f %f %f", L[3], L[6], L[7], L[10]);
	EJAudioMixerUpdate(m, 1, 1, 0, 0, 1, &r, 1); // whole buffer
	render(m, 6);
	CHECK(NEAR(L[0], 6) && NEAR(L[3], 9) && NEAR(L[4], 0), "loop points cleared: %f %f %f", L[0], L[3], L[4]);
	EJAudioMixerDestroy(m);
}

static void testBusChain(void) {
	EJAudioMixer *m = EJAudioMixerCreate(48000, 4);
	for( int i = 0; i < 48000; i++ ) { ones[i] = 1; }
	const float *ch[] = {ones};
	EJAudioMixerSetBuffer(m, 1, ch, 1, 48000, 48000);
	
	// voice -> bus 1 (x.5) -> bus 2 (x.5, plain) -> out; plus a direct path x.1
	CHECK(EJAudioMixerSetBus(m, 1, kEJAudioBusNone, 0, 1), "bus 1");
	CHECK(EJAudioMixerSetBus(m, 2, kEJAudioBusNone, 0, 1), "bus 2");
	EJAudioRoute r1 = to(2, .5f, 0, 0, 0), r2 = to(0, .5f, 0, .5f, 0);
	EJAudioMixerSetBusRoutes(m, 1, &r1, 1);
	EJAudioMixerSetBusRoutes(m, 2, &r2, 1);
	int order[] = {1, 2};
	EJAudioMixerSetBusOrder(m, order, 2);
	EJAudioRoute v[] = {to(1, 1, 0, 0, 0), to(0, .1f, 0, .1f, 0)};
	EJAudioMixerPlay(m, 1, 1, 0, 0, 0, 0, 1, v, 2);
	render(m, 300);
	CHECK(NEAR(L[0], .35) && NEAR(R[299], .35), "chain of buses adds up: %f %f", L[0], R[299]);
	
	// The wrong order delays bus 2's input by a block, as feedback would
	int reversed[] = {2, 1};
	EJAudioMixerSetBusOrder(m, reversed, 2);
	render(m, 256);
	CHECK(NEAR(L[0], .1) && NEAR(L[200], .35), "out of order, a block late: %f %f", L[0], L[200]);
	
	EJAudioMixerDeleteBus(m, 2);
	render(m, 128);
	CHECK(NEAR(L[0], .1), "deleting a bus drops routes to it: %f", L[0]);
	EJAudioMixerSetBusOrder(m, NULL, 0);
	render(m, 128);
	CHECK(NEAR(L[0], .1), "a bus that isn't ordered doesn't run: %f", L[0]);
	EJAudioMixerDestroy(m);
}

static void testDelayFeedback(void) {
	EJAudioMixer *m = EJAudioMixerCreate(48000, 4);
	float click[1] = {1};
	const float *ch[] = {click};
	EJAudioMixerSetBuffer(m, 1, ch, 1, 1, 48000);
	EJAudioMixerSetBus(m, 1, kEJAudioBusDelay, 1, 1);
	double params[] = {1000.0 / 48000};
	EJAudioMixerSetBusParams(m, 1, params, 1);
	// delay -> out, and delay -> x.5 -> delay
	EJAudioRoute routes[] = {to(0, 1, 0, 1, 0), to(1, .5f, 0, 0, 0)};
	EJAudioMixerSetBusRoutes(m, 1, routes, 2);
	int order[] = {1};
	EJAudioMixerSetBusOrder(m, order, 1);
	EJAudioRoute v = to(1, 1, 0, 0, 0);
	EJAudioMixerPlay(m, 1, 1, 0, 0, 0, 0, 1, &v, 1);
	
	static float l[4096], r[4096];
	EJAudioMixerRender(m, l, r, 4096);
	int first = -1, second = -1;
	for( int i = 0; i < 4096; i++ ) {
		if( l[i] > .9f && first < 0 ) { first = i; }
		else if( l[i] > .4f && l[i] < .6f && second < 0 ) { second = i; }
	}
	// Feedback arrives one block (128 frames) later than the delay time
	CHECK(first == 1000 && second == 2128, "echoes at 1000 and 2128: %d %d", first, second);
	EJAudioMixerDestroy(m);
}

static void testEffectBuses(void) {
	EJAudioMixer *m = EJAudioMixerCreate(48000, 4);
	static float tone[48000];
	for( int i = 0; i < 48000; i++ ) { tone[i] = sinf(2 * 3.14159265f * 10000 * i / 48000); }
	const float *ch[] = {tone};
	EJAudioMixerSetBuffer(m, 1, ch, 1, 48000, 48000);
	
	EJAudioMixerSetBus(m, 1, kEJAudioBusBiquad, 0, 1);
	double lowpass[] = {kEJBiquadLowpass, 500, 1, 0, 0};
	EJAudioMixerSetBusParams(m, 1, lowpass, 5);
	EJAudioRoute r = to(0, 1, 0, 1, 0);
	EJAudioMixerSetBusRoutes(m, 1, &r, 1);
	int order[] = {1};
	EJAudioMixerSetBusOrder(m, order, 1);
	EJAudioRoute v = to(1, 1, 0, 0, 0);
	EJAudioMixerPlay(m, 1, 1, 0, 1, 0, 0, 1, &v, 1);
	float peak = 0;
	for( int k = 0; k < 10; k++ ) {
		render(m, 1024);
		if( k > 2 ) for( int i = 0; i < 1024; i++ ) { peak = fmaxf(peak, fabsf(L[i])); }
	}
	CHECK(peak < .02f, "10 kHz through a 500 Hz lowpass bus: %f", peak);
	
	// Change the bus into a wave shaper that halves
	EJAudioMixerSetBus(m, 1, kEJAudioBusWaveShaper, 0, 1);
	float curve[2] = {-.5f, .5f};
	EJAudioMixerSetBusCurve(m, 1, curve, 2);
	peak = 0;
	for( int k = 0; k < 4; k++ ) {
		render(m, 1024);
		for( int i = 0; i < 1024; i++ ) { peak = fmaxf(peak, fabsf(L[i])); }
	}
	CHECK(fabsf(peak - .5f) < .01f, "wave shaper bus: %f", peak);
	
	// A convolver with a delayed impulse keeps sounding after the voice stops
	EJAudioMixerSetBus(m, 1, kEJAudioBusConvolver, 0, 1);
	static float impulse[2000];
	impulse[1999] = 1;
	const float *ir[] = {impulse};
	EJAudioMixerSetBusImpulse(m, 1, ir, 1, 2000, 1);
	render(m, 1024);
	EJAudioMixerStop(m, 1);
	int ids[4];
	EJAudioMixerTakeEnded(m, ids, 4);
	render(m, 2048);
	peak = 0;
	for( int i = 0; i < 2048; i++ ) { peak = fmaxf(peak, fabsf(L[i])); }
	CHECK(peak > .5f, "reverb tail continues after the voice ends: %f", peak);
	for( int k = 0; k < 4; k++ ) { render(m, 1024); }
	CHECK(L[1023] == 0, "and then goes quiet");
	
	EJAudioMixerSetBus(m, 2, kEJAudioBusCompressor, 0, 0);
	double comp[] = {-50, 0, 20, 0, .1};
	EJAudioMixerSetBusParams(m, 2, comp, 5);
	CHECK(EJAudioMixerGetBusReduction(m, 2) == 0, "no reduction before any sound");
	EJAudioMixerDestroy(m);
}

// The audio thread renders while this thread plays and stops voices.
static atomic_int running = 1;
static void *audioThread(void *arg) {
	float l[256], r[256];
	while( running ) { EJAudioMixerRender((EJAudioMixer *)arg, l, r, 256); }
	return NULL;
}

static void testThreads(void) {
	EJAudioMixer *m = EJAudioMixerCreate(44100, 16);
	float data[500];
	for( int i = 0; i < 500; i++ ) { data[i] = sinf(i * .1f); }
	const float *ch[] = {data};
	pthread_t thread;
	pthread_create(&thread, NULL, audioThread, m);

	int ids[64], endedCount = 0, played = 0;
	for( int i = 0; i < 20000; i++ ) {
		if( i % 50 == 0 ) { EJAudioMixerSetBuffer(m, i % 7, ch, 1, 500, 44100); }
		EJAudioRoute vr[] = {out(center), to(1 + i % 3, 1, 0, 0, 0)};
		if( EJAudioMixerPlay(m, i, i % 7, 0, i % 3 == 0, 0, 0, 1, vr, 2) ) { played++; }
		if( i % 3 == 0 ) { EJAudioMixerStop(m, i - 3); }
		if( i % 100 == 0 ) { EJAudioMixerDeleteBuffer(m, i % 7); }
		// Buses change under the audio thread too
		if( i % 37 == 0 ) {
			int bus = 1 + i % 3;
			EJAudioMixerSetBus(m, bus, i % 6, .1, i % 2);
			double params[] = {i % 8, 800, 1, 3, 0};
			EJAudioMixerSetBusParams(m, bus, params, 5);
			const float *ir[] = {data};
			EJAudioMixerSetBusImpulse(m, bus, ir, 1, 500, .1f);
			EJAudioMixerSetBusCurve(m, bus, data, 500);
			EJAudioRoute routes[] = {to(0, .5f, 0, .5f, 0), to(1 + (i + 1) % 3, .3f, 0, 0, .3f)};
			EJAudioMixerSetBusRoutes(m, bus, routes, 2);
			int order[] = {1, 2, 3};
			EJAudioMixerSetBusOrder(m, order, 3);
		}
		if( i % 101 == 0 ) { EJAudioMixerDeleteBus(m, 1 + i % 3); }
		endedCount += EJAudioMixerTakeEnded(m, ids, 64);
	}
	for( int i = 0; i < 20000; i++ ) { EJAudioMixerStop(m, i); }
	running = 0;
	pthread_join(thread, NULL);
	endedCount += EJAudioMixerTakeEnded(m, ids, 64);
	while( EJAudioMixerActiveVoices(m) == 0 && EJAudioMixerTakeEnded(m, ids, 64) ) {}
	CHECK(EJAudioMixerActiveVoices(m) == 0, "all voices stopped");
	printf("  threads: %d played, %d ended\n", played, endedCount);
	EJAudioMixerDestroy(m);
}

int main(void) {
	testMonoConstant();
	testResampleAndRate();
	testStereoMatrix();
	testLoopStopAndLimits();
	testReplaceAndDeleteWhilePlaying();
	testNonFiniteInput();
	testLoopPoints();
	testBusChain();
	testDelayFeedback();
	testEffectBuses();
	testThreads();
	printf(failures ? "%d FAILED\n" : "all mixer tests passed\n", failures);
	return failures != 0;
}
