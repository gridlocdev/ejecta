// Tests for Source/Ejecta/EJAudio/EJAudioEffects.c: just test-mixer
#include "EJAudioEffects.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef M_PI
	#define M_PI 3.14159265358979323846
#endif

static int failures = 0;
#define CHECK(cond, ...) do { if( !(cond) ) { failures++; \
	printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while(0)

#define RATE 48000.0
#define LEN 9600
static float L[LEN], R[LEN];

static void sine(double hz) {
	for( int i = 0; i < LEN; i++ ) { L[i] = R[i] = (float)sin(2 * M_PI * hz * i / RATE); }
}

// Peak over the second half, after the filter settles
static double peak(const float *x) {
	double p = 0;
	for( int i = LEN / 2; i < LEN; i++ ) { p = fmax(p, fabs(x[i])); }
	return p;
}

static double response(int type, double f0, double Q, double gain, double hz) {
	EJBiquad f = {0};
	EJBiquadSetup(&f, type, RATE, f0, Q, gain, 0);
	sine(hz);
	for( int i = 0; i < LEN; i += EJ_AUDIO_CHUNK ) { EJBiquadProcess(&f, L + i, R + i, EJ_AUDIO_CHUNK); }
	return peak(L);
}

static void testBiquad(void) {
	double pass = response(kEJBiquadLowpass, 1000, 1, 0, 100);
	double stop = response(kEJBiquadLowpass, 1000, 1, 0, 10000);
	CHECK(fabs(pass - 1) < .05 && stop < .02, "lowpass passes 100 Hz (%f) and stops 10 kHz (%f)", pass, stop);
	pass = response(kEJBiquadHighpass, 1000, 1, 0, 10000);
	stop = response(kEJBiquadHighpass, 1000, 1, 0, 100);
	CHECK(fabs(pass - 1) < .05 && stop < .02, "highpass (%f %f)", pass, stop);
	double bp = response(kEJBiquadBandpass, 1000, 1, 0, 1000);
	CHECK(fabs(bp - 1) < .05, "bandpass at center is unity: %f", bp);
	double notch = response(kEJBiquadNotch, 1000, 1, 0, 1000);
	CHECK(notch < .05, "notch at center: %f", notch);
	double peaking = response(kEJBiquadPeaking, 1000, 1, 6, 1000);
	CHECK(fabs(peaking - pow(10, 6 / 20.0)) < .05, "peaking +6 dB: %f", peaking);
	double shelf = response(kEJBiquadLowshelf, 1000, 1, -12, 50);
	CHECK(fabs(shelf - pow(10, -12 / 20.0)) < .03, "lowshelf -12 dB: %f", shelf);
	shelf = response(kEJBiquadHighshelf, 1000, 1, 6, 15000);
	CHECK(fabs(shelf - pow(10, 6 / 20.0)) < .1, "highshelf +6 dB: %f", shelf);
	double allpass = response(kEJBiquadAllpass, 1000, 1, 0, 3000);
	CHECK(fabs(allpass - 1) < .02, "allpass keeps level: %f", allpass);
	double edge = response(kEJBiquadLowpass, 30000, 1, 0, 5000);
	CHECK(fabs(edge - 1) < .01, "lowpass above nyquist passes: %f", edge);

	EJBiquad f = {0};
	EJBiquadSetup(&f, kEJBiquadLowpass, RATE, NAN, NAN, NAN, NAN);
	sine(100);
	EJBiquadProcess(&f, L, R, LEN);
	CHECK(isfinite(L[LEN-1]), "NaN parameters stay finite");
}

static void testDelay(void) {
	EJDelay d;
	CHECK(EJDelayInit(&d, 1000), "init");
	memset(L, 0, sizeof(L)); memset(R, 0, sizeof(R));
	L[0] = 1; R[10] = 1;
	d.delayFrames = 100;
	for( int i = 0; i < 1024; i += EJ_AUDIO_CHUNK ) { EJDelayProcess(&d, L + i, R + i, EJ_AUDIO_CHUNK); }
	CHECK(L[100] == 1 && L[99] == 0 && R[110] == 1 && L[0] == 0, "100 frame delay: %f %f %f", L[99], L[100], R[110]);

	memset(L, 0, sizeof(L)); memset(R, 0, sizeof(R));
	EJDelayFree(&d);
	EJDelayInit(&d, 1000);
	L[0] = 1;
	d.delayFrames = 50.5;
	EJDelayProcess(&d, L, R, 200);
	CHECK(fabs(L[50] - .5) < 1e-6 && fabs(L[51] - .5) < 1e-6, "fractional delay splits: %f %f", L[50], L[51]);

	L[0] = .25f;
	d.delayFrames = 0;
	EJDelayProcess(&d, L, R, 1);
	CHECK(L[0] == .25f, "zero delay passes through");
	d.delayFrames = 1e9;
	EJDelayProcess(&d, L, R, 200);
	CHECK(isfinite(L[199]), "too long a delay is clamped");
	EJDelayFree(&d);
}

static void testWaveShaper(void) {
	float identity[3] = {-1, 0, 1}, clip[2] = {-.5f, .5f};
	sine(1000);
	float before = L[7];
	EJWaveShaperProcess(identity, 3, L, R, LEN);
	CHECK(fabsf(L[7] - before) < 1e-6, "identity curve");
	sine(1000);
	EJWaveShaperProcess(clip, 2, L, R, LEN);
	CHECK(fabs(peak(L) - .5) < .01, "curve scales: %f", peak(L));
	L[0] = 5; L[1] = -5;
	EJWaveShaperProcess(identity, 3, L, R, 2);
	CHECK(L[0] == 1 && L[1] == -1, "outside -1..1 takes the ends");
}

static void testCompressor(void) {
	EJCompressor c = {0};
	EJCompressorSetup(&c, -24, 30, 12, .003f, .25f);
	sine(200);
	EJCompressorProcess(&c, L, R, LEN, RATE);
	double loud = peak(L);
	CHECK(c.gainDb < -10, "loud input is reduced: %f dB", c.gainDb);
	CHECK(loud < 1 && loud > .1, "loud output level: %f", loud);

	EJCompressor q = {0};
	EJCompressorSetup(&q, -24, 30, 12, .003f, .25f);
	sine(200);
	for( int i = 0; i < LEN; i++ ) { L[i] *= .001f; R[i] *= .001f; } // -60 dB
	EJCompressorProcess(&q, L, R, LEN, RATE);
	double gain = peak(L) / .001;
	CHECK(fabs(q.gainDb) < .1 && gain > 1.5, "quiet input passes with makeup gain: %f", gain);
}

// Direct convolution to check the FFT version against
static void convolveDirect(const float *x, int n, const float *h, int m, float *y, int delay) {
	for( int i = 0; i < n; i++ ) {
		double sum = 0;
		int t = i - delay;
		for( int k = 0; k < m && k <= t; k++ ) { sum += h[k] * x[t - k]; }
		y[i] = t >= 0 ? (float)sum : 0;
	}
}

static void testConvolver(void) {
	enum { N = 4000, M = 1500 };
	static float x[N], hl[M], hr[M], expectL[N], expectR[N], left[N], right[N];
	srand(1);
	for( int i = 0; i < N; i++ ) { x[i] = (float)rand() / RAND_MAX * 2 - 1; }
	for( int i = 0; i < M; i++ ) {
		hl[i] = ((float)rand() / RAND_MAX * 2 - 1) * expf(-i / 300.0f);
		hr[i] = ((float)rand() / RAND_MAX * 2 - 1) * expf(-i / 300.0f);
	}

	// Stereo impulse, mono input, scaled by .5
	const float *ir[] = {hl, hr};
	EJConvolver *c = EJConvolverCreate(ir, 2, M, .5f);
	CHECK(c != NULL, "create");
	memcpy(left, x, sizeof(x));
	memset(right, 0, sizeof(right));
	for( int i = 0; i < N; i += 100 ) { // odd sized blocks on purpose
		int n = N - i < 100 ? N - i : 100;
		EJConvolverProcess(c, left + i, right + i, n, 1);
	}
	convolveDirect(x, N, hl, M, expectL, 512);
	convolveDirect(x, N, hr, M, expectR, 512);
	double err = 0;
	for( int i = 0; i < N; i++ ) {
		err = fmax(err, fabs(left[i] - .5 * expectL[i]));
		err = fmax(err, fabs(right[i] - .5 * expectR[i]));
	}
	CHECK(err < 1e-3, "matches direct convolution, 512 frames late: max error %g", err);
	CHECK(EJConvolverTailFrames(c) == M + 512, "tail");
	EJConvolverDestroy(c);

	// Mono impulse, stereo input: each channel convolved on its own
	const float *mono[] = {hl};
	c = EJConvolverCreate(mono, 1, M, 1);
	memcpy(left, x, sizeof(x));
	for( int i = 0; i < N; i++ ) { right[i] = -x[i]; }
	EJConvolverProcess(c, left, right, N, 0);
	err = 0;
	for( int i = 0; i < N; i++ ) {
		err = fmax(err, fabs(left[i] - expectL[i]));
		err = fmax(err, fabs(right[i] + expectL[i]));
	}
	CHECK(err < 1e-3, "mono impulse on stereo input: max error %g", err);
	EJConvolverDestroy(c);

	CHECK(EJConvolverCreate(mono, 1, 0, 1) == NULL, "empty impulse refused");
}

int main(void) {
	testBiquad();
	testDelay();
	testWaveShaper();
	testCompressor();
	testConvolver();
	printf(failures ? "%d FAILED\n" : "all effect tests passed\n", failures);
	return failures != 0;
}
