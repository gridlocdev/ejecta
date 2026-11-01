#include "EJAudioEffects.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

#ifndef M_PI
	#define M_PI 3.14159265358979323846
#endif


// Biquad ---------------------------------------------------------------------

void EJBiquadSetup(EJBiquad *f, int type, double sampleRate,
	double frequency, double Q, double gainDb, double detuneCents
) {
	double nyquist = sampleRate / 2;
	double f0 = frequency * pow(2, detuneCents / 1200);
	if( !isfinite(f0) ) { f0 = 350; }
	if( !isfinite(Q) ) { Q = 1; }
	if( !isfinite(gainDb) ) { gainDb = 0; }

	double b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

	// At the edges of the range the spec's limits are a pass or a block
	if( f0 >= nyquist ) {
		if( type == kEJBiquadHighpass || type == kEJBiquadBandpass ) { b0 = 0; }
		if( type == kEJBiquadLowshelf ) { b0 = pow(10, gainDb / 20); }
		goto done;
	}
	if( f0 <= 0 ) {
		if( type == kEJBiquadLowpass || type == kEJBiquadBandpass ) { b0 = 0; }
		if( type == kEJBiquadHighshelf ) { b0 = pow(10, gainDb / 20); }
		goto done;
	}

	double w0 = 2 * M_PI * f0 / sampleRate;
	double cosw = cos(w0), sinw = sin(w0);
	double A = pow(10, gainDb / 40);
	double q = Q > 1e-4 ? Q : 1e-4;
	double alphaQ = sinw / (2 * q);
	double alphaQdB = sinw / (2 * pow(10, Q / 20));
	double alphaS = sinw / 2 * sqrt(2.0); // shelf slope S = 1
	double sqrtA2alpha = 2 * sqrt(A) * alphaS;

	switch( type ) {
		case kEJBiquadLowpass:
			b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = (1 - cosw) / 2;
			a0 = 1 + alphaQdB; a1 = -2 * cosw; a2 = 1 - alphaQdB;
			break;
		case kEJBiquadHighpass:
			b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = (1 + cosw) / 2;
			a0 = 1 + alphaQdB; a1 = -2 * cosw; a2 = 1 - alphaQdB;
			break;
		case kEJBiquadBandpass:
			b0 = alphaQ; b1 = 0; b2 = -alphaQ;
			a0 = 1 + alphaQ; a1 = -2 * cosw; a2 = 1 - alphaQ;
			break;
		case kEJBiquadNotch:
			b0 = 1; b1 = -2 * cosw; b2 = 1;
			a0 = 1 + alphaQ; a1 = -2 * cosw; a2 = 1 - alphaQ;
			break;
		case kEJBiquadAllpass:
			b0 = 1 - alphaQ; b1 = -2 * cosw; b2 = 1 + alphaQ;
			a0 = 1 + alphaQ; a1 = -2 * cosw; a2 = 1 - alphaQ;
			break;
		case kEJBiquadPeaking:
			b0 = 1 + alphaQ * A; b1 = -2 * cosw; b2 = 1 - alphaQ * A;
			a0 = 1 + alphaQ / A; a1 = -2 * cosw; a2 = 1 - alphaQ / A;
			break;
		case kEJBiquadLowshelf:
			b0 = A * ((A + 1) - (A - 1) * cosw + sqrtA2alpha);
			b1 = 2 * A * ((A - 1) - (A + 1) * cosw);
			b2 = A * ((A + 1) - (A - 1) * cosw - sqrtA2alpha);
			a0 = (A + 1) + (A - 1) * cosw + sqrtA2alpha;
			a1 = -2 * ((A - 1) + (A + 1) * cosw);
			a2 = (A + 1) + (A - 1) * cosw - sqrtA2alpha;
			break;
		case kEJBiquadHighshelf:
			b0 = A * ((A + 1) + (A - 1) * cosw + sqrtA2alpha);
			b1 = -2 * A * ((A - 1) + (A + 1) * cosw);
			b2 = A * ((A + 1) + (A - 1) * cosw - sqrtA2alpha);
			a0 = (A + 1) - (A - 1) * cosw + sqrtA2alpha;
			a1 = 2 * ((A - 1) - (A + 1) * cosw);
			a2 = (A + 1) - (A - 1) * cosw - sqrtA2alpha;
			break;
	}

done:
	f->b0 = b0 / a0; f->b1 = b1 / a0; f->b2 = b2 / a0;
	f->a1 = a1 / a0; f->a2 = a2 / a0;
}

void EJBiquadProcess(EJBiquad *f, float *left, float *right, int frames) {
	float *channels[2] = {left, right};
	for( int c = 0; c < 2; c++ ) {
		float *x = channels[c];
		double z1 = f->z1[c], z2 = f->z2[c];
		for( int i = 0; i < frames; i++ ) {
			// Transposed direct form II
			double in = x[i];
			double out = f->b0 * in + z1;
			z1 = f->b1 * in - f->a1 * out + z2;
			z2 = f->b2 * in - f->a2 * out;
			x[i] = (float)out;
		}
		// Keep denormals and blow-ups out of the state
		if( !isfinite(z1) || !isfinite(z2) ) { z1 = z2 = 0; }
		if( fabs(z1) < 1e-20 ) { z1 = 0; }
		if( fabs(z2) < 1e-20 ) { z2 = 0; }
		f->z1[c] = z1; f->z2[c] = z2;
	}
}


// Delay ----------------------------------------------------------------------

int EJDelayInit(EJDelay *d, int maxDelayFrames) {
	memset(d, 0, sizeof(*d));
	d->length = (maxDelayFrames > 0 ? maxDelayFrames : 1) + 2;
	for( int c = 0; c < 2; c++ ) {
		d->line[c] = calloc(d->length, sizeof(float));
		if( !d->line[c] ) { EJDelayFree(d); return 0; }
	}
	return 1;
}

void EJDelayFree(EJDelay *d) {
	free(d->line[0]);
	free(d->line[1]);
	d->line[0] = d->line[1] = NULL;
}

void EJDelayProcess(EJDelay *d, float *left, float *right, int frames) {
	double delay = d->delayFrames;
	if( !(delay >= 0) ) { delay = 0; }
	if( delay > d->length - 2 ) { delay = d->length - 2; }

	float *channels[2] = {left, right};
	int length = d->length;
	for( int i = 0; i < frames; i++ ) {
		int write = d->write;
		double read = write - delay;
		if( read < 0 ) { read += length; }
		int r0 = (int)read;
		int r1 = r0 + 1 < length ? r0 + 1 : 0;
		float t = (float)(read - r0);
		for( int c = 0; c < 2; c++ ) {
			float *line = d->line[c];
			line[write] = channels[c][i];
			// A delay of 0 reads what was just written
			channels[c][i] = line[r0] + (line[r1] - line[r0]) * t;
		}
		d->write = write + 1 < length ? write + 1 : 0;
	}
}


// Wave shaper ----------------------------------------------------------------

void EJWaveShaperProcess(const float *curve, int n, float *left, float *right, int frames) {
	if( !curve || n < 1 ) { return; }
	float *channels[2] = {left, right};
	for( int c = 0; c < 2; c++ ) {
		float *x = channels[c];
		for( int i = 0; i < frames; i++ ) {
			float v = (n - 1) * 0.5f * (x[i] + 1);
			if( !(v > 0) ) { x[i] = curve[0]; }
			else if( v >= n - 1 ) { x[i] = curve[n - 1]; }
			else {
				int k = (int)v;
				float t = v - k;
				x[i] = curve[k] + (curve[k + 1] - curve[k]) * t;
			}
		}
	}
}


// Compressor -----------------------------------------------------------------

// The static curve: output level in dB for an input level in dB
static double compressorCurve(const EJCompressor *c, double x) {
	double t = c->threshold, w = c->knee, r = c->ratio;
	if( 2 * (x - t) < -w ) { return x; }
	if( w > 0 && 2 * fabs(x - t) <= w ) {
		double d = x - t + w / 2;
		return x + (1 / r - 1) * d * d / (2 * w);
	}
	return t + (x - t) / r;
}

void EJCompressorSetup(EJCompressor *c, float threshold, float knee, float ratio, float attack, float release) {
	c->threshold = isfinite(threshold) ? fminf(fmaxf(threshold, -100), 0) : -24;
	c->knee = isfinite(knee) ? fminf(fmaxf(knee, 0), 40) : 30;
	c->ratio = isfinite(ratio) ? fminf(fmaxf(ratio, 1), 20) : 12;
	c->attack = isfinite(attack) ? fminf(fmaxf(attack, 0), 1) : 0.003f;
	c->release = isfinite(release) ? fminf(fmaxf(release, 0), 1) : 0.25f;
	// Make up the level lost at full scale, the way the spec does
	c->makeupDb = -0.6 * compressorCurve(c, 0);
}

void EJCompressorProcess(EJCompressor *c, float *left, float *right, int frames, double sampleRate) {
	double attack = c->attack > 0 ? exp(-1 / (c->attack * sampleRate)) : 0;
	double release = c->release > 0 ? exp(-1 / (c->release * sampleRate)) : 0;
	double gainDb = c->gainDb;
	for( int i = 0; i < frames; i++ ) {
		double level = fmax(fabs(left[i]), fabs(right[i]));
		double inDb = level > 1e-6 ? 20 * log10(level) : -120;
		double target = compressorCurve(c, inDb) - inDb;
		double coef = target < gainDb ? attack : release;
		gainDb = coef * gainDb + (1 - coef) * target;
		float gain = (float)pow(10, (gainDb + c->makeupDb) / 20);
		left[i] *= gain;
		right[i] *= gain;
	}
	c->gainDb = isfinite(gainDb) ? gainDb : 0;
}


// Convolver ------------------------------------------------------------------

#define CONV_BLOCK 512
#define CONV_FFT (2 * CONV_BLOCK)
#define CONV_BINS (CONV_FFT / 2 + 1)

struct EJConvolver {
	int channelCount, length, partitions;
	float scale;
	float *hRe[2], *hIm[2];     // impulse spectra, partitions x bins
	float *fdlRe[2], *fdlIm[2]; // recent input spectra, partitions x bins
	int fdlPos;
	float input[2][CONV_BLOCK], previous[2][CONV_BLOCK], output[2][CONV_BLOCK];
	int pos;
	float twRe[CONV_FFT / 2], twIm[CONV_FFT / 2];
	int bitrev[CONV_FFT];
	float workRe[CONV_FFT], workIm[CONV_FFT];
	float accRe[CONV_BINS], accIm[CONV_BINS];
};

// In-place radix-2 FFT; inverse is unscaled
static void fft(EJConvolver *c, float *re, float *im, int inverse) {
	const int n = CONV_FFT;
	for( int i = 0; i < n; i++ ) {
		int j = c->bitrev[i];
		if( j > i ) {
			float t = re[i]; re[i] = re[j]; re[j] = t;
			t = im[i]; im[i] = im[j]; im[j] = t;
		}
	}
	for( int size = 2; size <= n; size *= 2 ) {
		int half = size / 2, step = n / size;
		for( int start = 0; start < n; start += size ) {
			for( int k = 0; k < half; k++ ) {
				float wr = c->twRe[k * step];
				float wi = inverse ? -c->twIm[k * step] : c->twIm[k * step];
				int a = start + k, b = a + half;
				float tr = re[b] * wr - im[b] * wi;
				float ti = re[b] * wi + im[b] * wr;
				re[b] = re[a] - tr; im[b] = im[a] - ti;
				re[a] += tr; im[a] += ti;
			}
		}
	}
}

EJConvolver *EJConvolverCreate(const float *const *impulse, int channelCount, int length, float scale) {
	if( channelCount < 1 || length < 1 || !impulse || !impulse[0] ) { return NULL; }
	EJConvolver *c = calloc(1, sizeof(EJConvolver));
	if( !c ) { return NULL; }
	c->channelCount = channelCount > 2 ? 2 : channelCount;
	c->length = length;
	c->partitions = (length + CONV_BLOCK - 1) / CONV_BLOCK;
	c->scale = isfinite(scale) ? scale : 1;

	int bits = 0;
	while( (1 << bits) < CONV_FFT ) { bits++; }
	for( int i = 0; i < CONV_FFT; i++ ) {
		int r = 0;
		for( int b = 0; b < bits; b++ ) { r |= ((i >> b) & 1) << (bits - 1 - b); }
		c->bitrev[i] = r;
	}
	for( int k = 0; k < CONV_FFT / 2; k++ ) {
		c->twRe[k] = (float)cos(-2 * M_PI * k / CONV_FFT);
		c->twIm[k] = (float)sin(-2 * M_PI * k / CONV_FFT);
	}

	size_t spectra = (size_t)c->partitions * CONV_BINS;
	for( int ch = 0; ch < 2; ch++ ) {
		c->fdlRe[ch] = calloc(spectra, sizeof(float));
		c->fdlIm[ch] = calloc(spectra, sizeof(float));
		if( !c->fdlRe[ch] || !c->fdlIm[ch] ) { EJConvolverDestroy(c); return NULL; }
	}
	for( int ch = 0; ch < c->channelCount; ch++ ) {
		c->hRe[ch] = calloc(spectra, sizeof(float));
		c->hIm[ch] = calloc(spectra, sizeof(float));
		if( !c->hRe[ch] || !c->hIm[ch] ) { EJConvolverDestroy(c); return NULL; }

		for( int p = 0; p < c->partitions; p++ ) {
			memset(c->workRe, 0, sizeof(c->workRe));
			memset(c->workIm, 0, sizeof(c->workIm));
			int start = p * CONV_BLOCK;
			int count = length - start < CONV_BLOCK ? length - start : CONV_BLOCK;
			for( int i = 0; i < count; i++ ) {
				float v = impulse[ch][start + i];
				c->workRe[i] = isfinite(v) ? v : 0;
			}
			fft(c, c->workRe, c->workIm, 0);
			memcpy(c->hRe[ch] + p * CONV_BINS, c->workRe, sizeof(float) * CONV_BINS);
			memcpy(c->hIm[ch] + p * CONV_BINS, c->workIm, sizeof(float) * CONV_BINS);
		}
	}
	return c;
}

void EJConvolverDestroy(EJConvolver *c) {
	if( !c ) { return; }
	for( int ch = 0; ch < 2; ch++ ) {
		free(c->hRe[ch]); free(c->hIm[ch]);
		free(c->fdlRe[ch]); free(c->fdlIm[ch]);
	}
	free(c);
}

void EJConvolverReset(EJConvolver *c) {
	size_t spectra = (size_t)c->partitions * CONV_BINS * sizeof(float);
	for( int ch = 0; ch < 2; ch++ ) {
		memset(c->fdlRe[ch], 0, spectra);
		memset(c->fdlIm[ch], 0, spectra);
	}
	memset(c->input, 0, sizeof(c->input));
	memset(c->previous, 0, sizeof(c->previous));
	memset(c->output, 0, sizeof(c->output));
	c->pos = 0;
	c->fdlPos = 0;
}

int EJConvolverTailFrames(EJConvolver *c) {
	return c->length + CONV_BLOCK;
}

// Convolve the block just collected in c->input into c->output
static void convolveBlock(EJConvolver *c, int monoInput) {
	const int P = c->partitions;
	int inputs = monoInput ? 1 : 2;

	// Spectrum of the last two blocks (overlap-save) into the delay line
	for( int ch = 0; ch < inputs; ch++ ) {
		memcpy(c->workRe, c->previous[ch], sizeof(float) * CONV_BLOCK);
		memcpy(c->workRe + CONV_BLOCK, c->input[ch], sizeof(float) * CONV_BLOCK);
		memset(c->workIm, 0, sizeof(c->workIm));
		fft(c, c->workRe, c->workIm, 0);
		memcpy(c->fdlRe[ch] + c->fdlPos * CONV_BINS, c->workRe, sizeof(float) * CONV_BINS);
		memcpy(c->fdlIm[ch] + c->fdlPos * CONV_BINS, c->workIm, sizeof(float) * CONV_BINS);
		memcpy(c->previous[ch], c->input[ch], sizeof(float) * CONV_BLOCK);
	}

	const float norm = c->scale / CONV_FFT;
	for( int out = 0; out < 2; out++ ) {
		int in = monoInput ? 0 : out;
		int h = c->channelCount > 1 ? out : 0;
		if( out == 1 && monoInput && c->channelCount == 1 ) {
			memcpy(c->output[1], c->output[0], sizeof(float) * CONV_BLOCK);
			break;
		}

		memset(c->accRe, 0, sizeof(c->accRe));
		memset(c->accIm, 0, sizeof(c->accIm));
		for( int p = 0; p < P; p++ ) {
			int slot = c->fdlPos - p;
			if( slot < 0 ) { slot += P; }
			const float *xr = c->fdlRe[in] + slot * CONV_BINS, *xi = c->fdlIm[in] + slot * CONV_BINS;
			const float *hr = c->hRe[h] + p * CONV_BINS, *hi = c->hIm[h] + p * CONV_BINS;
			for( int k = 0; k < CONV_BINS; k++ ) {
				c->accRe[k] += xr[k] * hr[k] - xi[k] * hi[k];
				c->accIm[k] += xr[k] * hi[k] + xi[k] * hr[k];
			}
		}

		// Rebuild the conjugate-symmetric spectrum of a real signal
		for( int k = 0; k < CONV_BINS; k++ ) {
			c->workRe[k] = c->accRe[k];
			c->workIm[k] = c->accIm[k];
		}
		for( int k = 1; k < CONV_FFT / 2; k++ ) {
			c->workRe[CONV_FFT - k] = c->accRe[k];
			c->workIm[CONV_FFT - k] = -c->accIm[k];
		}
		fft(c, c->workRe, c->workIm, 1);
		for( int i = 0; i < CONV_BLOCK; i++ ) {
			c->output[out][i] = c->workRe[CONV_BLOCK + i] * norm;
		}
	}
	c->fdlPos = (c->fdlPos + 1) % P;
}

void EJConvolverProcess(EJConvolver *c, float *left, float *right, int frames, int monoInput) {
	for( int i = 0; i < frames; i++ ) {
		c->input[0][c->pos] = left[i];
		c->input[1][c->pos] = right[i];
		left[i] = c->output[0][c->pos];
		right[i] = c->output[1][c->pos];
		if( ++c->pos == CONV_BLOCK ) {
			convolveBlock(c, monoInput);
			c->pos = 0;
		}
	}
}
