// EJAudioMixerCore is the sample mixer behind the Web Audio API in Ejecta.
// It is plain C so it can be tested on any machine.
//
// Buffers hold planar float samples at their own sample rate. A voice plays a
// buffer from an offset, at a rate, looping or not, and mixes it into a stereo
// output through a 2x2 matrix:
//   outL += m[0] * inL + m[1] * inR
//   outR += m[2] * inL + m[3] * inR
// For a mono buffer inR is 0. The JavaScript side works out the matrix from
// the gain and stereo panner nodes between a source and the destination.
//
// Threads: EJAudioMixerRender() runs on the audio thread. Every other function
// is for one other thread (the JS thread). A spinlock guards the voice list.
// The audio thread never waits for it (it renders silence for that block
// instead), and never allocates or frees. NaN and infinite values from
// JavaScript are treated as 0.

#ifndef EJAudioMixerCore_h
#define EJAudioMixerCore_h

#ifdef __cplusplus
extern "C" {
#endif

typedef struct EJAudioMixer EJAudioMixer;

EJAudioMixer *EJAudioMixerCreate(double outputSampleRate, int maxVoices);
void EJAudioMixerDestroy(EJAudioMixer *mixer);

// Change the output rate, e.g. when the audio route changes. Voices keep
// playing at their pitch.
void EJAudioMixerSetOutputSampleRate(EJAudioMixer *mixer, double outputSampleRate);
double EJAudioMixerGetOutputSampleRate(EJAudioMixer *mixer);

// Copies the samples. Replaces a buffer with the same id; voices already
// playing the old samples finish with them. Returns 0 on failure.
int EJAudioMixerSetBuffer(EJAudioMixer *mixer, int bufferId,
	const float *const *channels, int channelCount, int length, double sampleRate);
void EJAudioMixerDeleteBuffer(EJAudioMixer *mixer, int bufferId);

// Starts voiceId playing bufferId. Returns 0 if the buffer doesn't exist or
// every voice is busy; the voice is then not reported as ended either.
int EJAudioMixerPlay(EJAudioMixer *mixer, int voiceId, int bufferId,
	double offsetSeconds, int loop, double rate, const float matrix[4]);
void EJAudioMixerUpdate(EJAudioMixer *mixer, int voiceId,
	int loop, double rate, const float matrix[4]);

// Stops a voice. It is reported by EJAudioMixerTakeEnded() like one that
// played to its end.
void EJAudioMixerStop(EJAudioMixer *mixer, int voiceId);

// Audio thread: writes frameCount frames to left and right (overwriting).
void EJAudioMixerRender(EJAudioMixer *mixer, float *left, float *right, int frameCount);

// Collects the ids of voices that ended since the last call, up to maxIds,
// and frees their slots. Returns how many were written.
int EJAudioMixerTakeEnded(EJAudioMixer *mixer, int *ids, int maxIds);

// Seconds of audio rendered so far; the AudioContext's currentTime.
double EJAudioMixerGetTime(EJAudioMixer *mixer);
int EJAudioMixerActiveVoices(EJAudioMixer *mixer);

#ifdef __cplusplus
}
#endif

#endif
