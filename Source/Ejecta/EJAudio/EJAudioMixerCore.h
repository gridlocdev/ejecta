// EJAudioMixerCore is the sample mixer behind the Web Audio API in Ejecta.
// It is plain C so it can be tested on any machine.
//
// Buffers hold planar float samples at their own sample rate. A voice plays a
// buffer from an offset, at a rate, looping or not, and sends it along routes.
// A route goes to the output (target 0) or to an effect bus, through a 2x2
// matrix:
//   outL += m[0] * inL + m[1] * inR
//   outR += m[2] * inL + m[3] * inR
// For a mono buffer inR is 0. Buses run an effect (filter, delay, wave shaper,
// compressor, convolver, or none) on what is sent to them and send the result
// on along their own routes. They run in the order set by
// EJAudioMixerSetBusOrder(); a route to a bus that already ran in this block
// (a feedback loop) arrives in the next block, EJ_AUDIO_CHUNK frames later.
// The JavaScript side works out routes and matrices from the Web Audio graph.
//
// Threads: EJAudioMixerRender() runs on the audio thread. Every other function
// is for one other thread (the JS thread). A spinlock guards voices and buses.
// The audio thread never waits for it (it renders silence for that block
// instead), and never allocates or frees. NaN and infinite values from
// JavaScript are treated as 0.

#ifndef EJAudioMixerCore_h
#define EJAudioMixerCore_h

#ifdef __cplusplus
extern "C" {
#endif

typedef struct EJAudioMixer EJAudioMixer;

#define EJ_AUDIO_MAX_ROUTES 16
#define EJ_AUDIO_MAX_BUSES 64

typedef struct {
	int target;      // 0 for the output, or a bus id
	float matrix[4];
} EJAudioRoute;

enum {
	kEJAudioBusNone = 0, // sums its input and passes it on
	kEJAudioBusBiquad,
	kEJAudioBusDelay,
	kEJAudioBusWaveShaper,
	kEJAudioBusCompressor,
	kEJAudioBusConvolver
};

EJAudioMixer *EJAudioMixerCreate(double outputSampleRate, int maxVoices);
void EJAudioMixerDestroy(EJAudioMixer *mixer);

// Change the output rate, e.g. when the audio route changes. Voices keep
// playing at their pitch.
void EJAudioMixerSetOutputSampleRate(EJAudioMixer *mixer, double outputSampleRate);
double EJAudioMixerGetOutputSampleRate(EJAudioMixer *mixer);


// Buffers ---------------------------------------------------------------------

// Copies the samples. Replaces a buffer with the same id; voices already
// playing the old samples finish with them. Returns 0 on failure.
int EJAudioMixerSetBuffer(EJAudioMixer *mixer, int bufferId,
	const float *const *channels, int channelCount, int length, double sampleRate);
void EJAudioMixerDeleteBuffer(EJAudioMixer *mixer, int bufferId);


// Voices ----------------------------------------------------------------------

// Starts voiceId playing bufferId. A loop repeats loopStart..loopEnd (seconds)
// once it gets there; with loopEnd <= loopStart it repeats the whole buffer.
// Returns 0 if the buffer doesn't exist or every voice is busy; the voice is
// then not reported as ended either.
int EJAudioMixerPlay(EJAudioMixer *mixer, int voiceId, int bufferId,
	double offsetSeconds, int loop, double loopStart, double loopEnd, double rate,
	const EJAudioRoute *routes, int routeCount);
void EJAudioMixerUpdate(EJAudioMixer *mixer, int voiceId,
	int loop, double loopStart, double loopEnd, double rate,
	const EJAudioRoute *routes, int routeCount);

// Stops a voice. It is reported by EJAudioMixerTakeEnded() like one that
// played to its end.
void EJAudioMixerStop(EJAudioMixer *mixer, int voiceId);

// Collects the ids of voices that ended since the last call, up to maxIds,
// and frees their slots. Returns how many were written.
int EJAudioMixerTakeEnded(EJAudioMixer *mixer, int *ids, int maxIds);
int EJAudioMixerActiveVoices(EJAudioMixer *mixer);


// Effect buses ----------------------------------------------------------------

// Creates a bus, or changes its type. A delay bus holds up to maxDelaySeconds.
// monoInput: only the left channel carries signal (a mono source), which a
// convolver with a stereo impulse spreads to both outputs. Returns 0 on failure.
int EJAudioMixerSetBus(EJAudioMixer *mixer, int busId, int type, double maxDelaySeconds, int monoInput);
void EJAudioMixerDeleteBus(EJAudioMixer *mixer, int busId);

// Parameters by type:
//   biquad:     filter type (kEJBiquad*), frequency, Q, gain (dB), detune (cents)
//   delay:      delay time (seconds)
//   compressor: threshold, knee, ratio, attack, release
void EJAudioMixerSetBusParams(EJAudioMixer *mixer, int busId, const double *params, int count);
// Copies the curve; NULL or 0 length passes the input through
void EJAudioMixerSetBusCurve(EJAudioMixer *mixer, int busId, const float *curve, int length);
// Copies the impulse response; NULL or 0 length makes the convolver silent
void EJAudioMixerSetBusImpulse(EJAudioMixer *mixer, int busId,
	const float *const *channels, int channelCount, int length, float scale);
void EJAudioMixerSetBusRoutes(EJAudioMixer *mixer, int busId, const EJAudioRoute *routes, int routeCount);
// Buses not in the order don't run
void EJAudioMixerSetBusOrder(EJAudioMixer *mixer, const int *busIds, int count);
// A compressor's current gain reduction in dB (<= 0)
double EJAudioMixerGetBusReduction(EJAudioMixer *mixer, int busId);


// Audio thread: writes frameCount frames to left and right (overwriting).
void EJAudioMixerRender(EJAudioMixer *mixer, float *left, float *right, int frameCount);

// Seconds of audio rendered so far; the AudioContext's currentTime.
double EJAudioMixerGetTime(EJAudioMixer *mixer);

#ifdef __cplusplus
}
#endif

#endif
