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

static const float center[4] = {1, 0, 1, 0}; // mono to both speakers
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
	CHECK(EJAudioMixerPlay(m, 7, 1, 0, 0, 1, center), "play");

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
	EJAudioMixerPlay(m, 1, 1, .5, 0, 1, center); // from the middle
	render(m, 2);
	CHECK(NEAR(L[0], .5) && NEAR(L[1], .5 + .5 / 24000), "offset and half steps: %f %f", L[0], L[1]);

	// Half a second left at 48 kHz output is 24000 frames; at rate 2, 12000
	EJAudioMixerUpdate(m, 1, 0, 2, center);
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
	EJAudioMixerPlay(m, 1, 1, 0, 0, 1, swap);
	const float half[4] = {.5f, 0, 0, .5f};
	EJAudioMixerPlay(m, 2, 1, 0, 0, 1, half);
	render(m, 4);
	CHECK(NEAR(L[0], .75 + .125) && NEAR(R[0], .25 + .375), "matrix mixes channels and voices add: %f %f", L[0], R[0]);
	EJAudioMixerDestroy(m);
}

static void testLoopStopAndLimits(void) {
	EJAudioMixer *m = EJAudioMixerCreate(44100, 2);
	float data[10] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9};
	const float *ch[] = {data};
	EJAudioMixerSetBuffer(m, 1, ch, 1, 10, 44100);
	CHECK(EJAudioMixerPlay(m, 1, 1, 0, 1, 1, center), "loop plays");
	render(m, 25);
	CHECK(NEAR(L[9], 9) && NEAR(L[10], 0) && NEAR(L[24], 4), "loop wraps: %f %f %f", L[9], L[10], L[24]);
	CHECK(ended(m, NULL) == 0, "a loop doesn't end");

	CHECK(EJAudioMixerPlay(m, 2, 1, 0, 0, 1, center), "second voice");
	CHECK(!EJAudioMixerPlay(m, 3, 1, 0, 0, 1, center), "no third voice with 2 slots");
	CHECK(!EJAudioMixerPlay(m, 4, 99, 0, 0, 1, center), "unknown buffer");

	EJAudioMixerStop(m, 1);
	int id = 0;
	CHECK(ended(m, &id) == 1 && id == 1, "stopped voice reported as ended");
	CHECK(EJAudioMixerActiveVoices(m) == 1, "one voice left");

	CHECK(EJAudioMixerPlay(m, 5, 1, 2.0, 0, 1, center), "offset past the end still starts");
	CHECK(ended(m, &id) == 1 && id == 5, "and ends at once");
	EJAudioMixerDestroy(m);
}

static void testReplaceAndDeleteWhilePlaying(void) {
	EJAudioMixer *m = EJAudioMixerCreate(44100, 4);
	float a[1000], b[1000];
	for( int i = 0; i < 1000; i++ ) { a[i] = 1; b[i] = 2; }
	const float *cha[] = {a}, *chb[] = {b};
	EJAudioMixerSetBuffer(m, 1, cha, 1, 1000, 44100);
	EJAudioMixerPlay(m, 1, 1, 0, 0, 1, center);
	EJAudioMixerSetBuffer(m, 1, chb, 1, 1000, 44100);
	EJAudioMixerPlay(m, 2, 1, 0, 0, 1, center);
	render(m, 10);
	CHECK(NEAR(L[0], 3), "old voice keeps old samples, new voice gets new: %f", L[0]);
	EJAudioMixerDeleteBuffer(m, 1);
	render(m, 2000); // both end; buffers freed on take (ASan checks)
	CHECK(ended(m, NULL) == 2, "both end");
	CHECK(!EJAudioMixerPlay(m, 3, 1, 0, 0, 1, center), "deleted buffer can't play");
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
	CHECK(EJAudioMixerPlay(m, 1, 1, NAN, 1, INFINITY, bad), "plays with bad values");
	render(m, 16);
	CHECK(isfinite(L[0]) && isfinite(R[0]) && NEAR(R[0], .5) && NEAR(L[0], 0),
		"NaN and infinity become 0: %f %f", L[0], R[0]);
	EJAudioMixerUpdate(m, 1, 1, NAN, bad);
	render(m, 16);
	CHECK(isfinite(L[5]) && isfinite(R[5]), "update with NaN stays finite");
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
		if( EJAudioMixerPlay(m, i, i % 7, 0, i % 3 == 0, 1, center) ) { played++; }
		if( i % 3 == 0 ) { EJAudioMixerStop(m, i - 3); }
		if( i % 100 == 0 ) { EJAudioMixerDeleteBuffer(m, i % 7); }
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
	testThreads();
	printf(failures ? "%d FAILED\n" : "all mixer tests passed\n", failures);
	return failures != 0;
}
