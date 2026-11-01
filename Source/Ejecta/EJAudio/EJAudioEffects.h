// Effect processors for the Web Audio nodes Ejecta supports: BiquadFilterNode,
// DelayNode, WaveShaperNode, DynamicsCompressorNode and ConvolverNode. Plain C;
// all process two channels in place. The setup functions allocate and are for
// the JS thread; the process functions run on the audio thread.

#ifndef EJAudioEffects_h
#define EJAudioEffects_h

#ifdef __cplusplus
extern "C" {
#endif

// The mixer processes effects in blocks of at most this many frames, like Web
// Audio's render quantum. Feedback through a delay adds one block of latency.
#define EJ_AUDIO_CHUNK 128

// Biquad filter, coefficients as in the Web Audio spec
enum {
	kEJBiquadLowpass = 0, kEJBiquadHighpass, kEJBiquadBandpass, kEJBiquadLowshelf,
	kEJBiquadHighshelf, kEJBiquadPeaking, kEJBiquadNotch, kEJBiquadAllpass
};

typedef struct {
	double b0, b1, b2, a1, a2;
	double z1[2], z2[2];
} EJBiquad;

// Only changes the coefficients; the filter's state carries on
void EJBiquadSetup(EJBiquad *f, int type, double sampleRate,
	double frequency, double Q, double gainDb, double detuneCents);
void EJBiquadProcess(EJBiquad *f, float *left, float *right, int frames);


// Delay line with linear interpolation
typedef struct {
	float *line[2];
	int length; // frames, at least the longest delay + 1
	int write;
	double delayFrames;
} EJDelay;

int EJDelayInit(EJDelay *d, int maxDelayFrames);
void EJDelayFree(EJDelay *d);
void EJDelayProcess(EJDelay *d, float *left, float *right, int frames);


// Wave shaper: maps -1..1 through the curve, as the Web Audio spec does
void EJWaveShaperProcess(const float *curve, int curveLength, float *left, float *right, int frames);


// Dynamics compressor. threshold and knee in dB, attack and release in seconds.
typedef struct {
	float threshold, knee, ratio, attack, release;
	double gainDb;      // smoothed gain reduction, <= 0
	double makeupDb;
} EJCompressor;

void EJCompressorSetup(EJCompressor *c, float threshold, float knee, float ratio, float attack, float release);
void EJCompressorProcess(EJCompressor *c, float *left, float *right, int frames, double sampleRate);


// Convolver: uniformly partitioned FFT convolution in blocks of 512 frames,
// so its output is 512 frames late. scale is applied to the output; the JS
// side computes Web Audio's normalization.
typedef struct EJConvolver EJConvolver;

EJConvolver *EJConvolverCreate(const float *const *impulse, int channelCount, int length, float scale);
void EJConvolverDestroy(EJConvolver *c);
// With monoInput, left is the input for both outputs
void EJConvolverProcess(EJConvolver *c, float *left, float *right, int frames, int monoInput);
int EJConvolverTailFrames(EJConvolver *c);
// Forget all input, as if just created; for when a silent convolver resumes
void EJConvolverReset(EJConvolver *c);

#ifdef __cplusplus
}
#endif

#endif
