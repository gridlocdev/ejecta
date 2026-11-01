// The functions sim.mjs calls, with plain number and pointer arguments.
#include "EJAudioMixerCore.h"
#include "EJAudioDecodeOgg.h"

#define EXPORT(name) __attribute__((export_name(name)))

EXPORT("mixer_create") EJAudioMixer *mixer_create(double rate, int voices) {
	return EJAudioMixerCreate(rate, voices);
}
EXPORT("mixer_rate") double mixer_rate(EJAudioMixer *m) { return EJAudioMixerGetOutputSampleRate(m); }
EXPORT("mixer_time") double mixer_time(EJAudioMixer *m) { return EJAudioMixerGetTime(m); }

EXPORT("set_buffer") int set_buffer(EJAudioMixer *m, int id, const float *ch0, const float *ch1,
	int channelCount, int length, double rate
) {
	const float *channels[2] = {ch0, ch1};
	return EJAudioMixerSetBuffer(m, id, channels, channelCount, length, rate);
}
EXPORT("delete_buffer") void delete_buffer(EJAudioMixer *m, int id) { EJAudioMixerDeleteBuffer(m, id); }

EXPORT("play") int play(EJAudioMixer *m, int voice, int buffer, double offset, int loop,
	double loopStart, double loopEnd, double rate, const EJAudioRoute *routes, int count
) {
	return EJAudioMixerPlay(m, voice, buffer, offset, loop, loopStart, loopEnd, rate, routes, count);
}
EXPORT("update") void update(EJAudioMixer *m, int voice, int loop, double loopStart, double loopEnd,
	double rate, const EJAudioRoute *routes, int count
) {
	EJAudioMixerUpdate(m, voice, loop, loopStart, loopEnd, rate, routes, count);
}
EXPORT("stop") void stop(EJAudioMixer *m, int voice) { EJAudioMixerStop(m, voice); }
EXPORT("take_ended") int take_ended(EJAudioMixer *m, int *ids, int max) { return EJAudioMixerTakeEnded(m, ids, max); }
EXPORT("active_voices") int active_voices(EJAudioMixer *m) { return EJAudioMixerActiveVoices(m); }

EXPORT("set_bus") int set_bus(EJAudioMixer *m, int id, int type, double maxDelay, int mono) {
	return EJAudioMixerSetBus(m, id, type, maxDelay, mono);
}
EXPORT("delete_bus") void delete_bus(EJAudioMixer *m, int id) { EJAudioMixerDeleteBus(m, id); }
EXPORT("set_bus_params") void set_bus_params(EJAudioMixer *m, int id, const double *params, int count) {
	EJAudioMixerSetBusParams(m, id, params, count);
}
EXPORT("set_bus_curve") void set_bus_curve(EJAudioMixer *m, int id, const float *curve, int length) {
	EJAudioMixerSetBusCurve(m, id, curve, length);
}
EXPORT("set_bus_impulse") void set_bus_impulse(EJAudioMixer *m, int id, const float *ch0, const float *ch1,
	int channelCount, int length, float scale
) {
	const float *channels[2] = {ch0, ch1};
	EJAudioMixerSetBusImpulse(m, id, channelCount ? channels : 0, channelCount, length, scale);
}
EXPORT("set_bus_routes") void set_bus_routes(EJAudioMixer *m, int id, const EJAudioRoute *routes, int count) {
	EJAudioMixerSetBusRoutes(m, id, routes, count);
}
EXPORT("set_bus_order") void set_bus_order(EJAudioMixer *m, const int *ids, int count) {
	EJAudioMixerSetBusOrder(m, ids, count);
}
EXPORT("get_bus_reduction") double get_bus_reduction(EJAudioMixer *m, int id) { return EJAudioMixerGetBusReduction(m, id); }

EXPORT("render") void render(EJAudioMixer *m, float *left, float *right, int frames) {
	EJAudioMixerRender(m, left, right, frames);
}

EXPORT("decode_ogg") int decode_ogg(const void *data, int size, EJDecodedAudio *out) {
	return EJAudioDecodeOggVorbis(data, size, out);
}
EXPORT("decoded_free") void decoded_free(EJDecodedAudio *audio) { EJDecodedAudioFree(audio); }
