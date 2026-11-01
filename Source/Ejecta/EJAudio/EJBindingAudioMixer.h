// Ejecta.AudioMixer is the native half of the Web Audio API in Ejecta.js.
// It plays sample buffers and effect buses through EJAudioMixerCore on an
// AVAudioEngine, and decodes audio files (decodeAudioData). Ejecta.js builds
// AudioContext and its nodes on top of it; scripts use those, not this class.
//
// JS API (routes are flat arrays: [target, m0, m1, m2, m3, target, ...] with
// target 0 for the output or a bus id):
//   setBuffer(id, sampleRate, channel0 [, channel1])  Float32Arrays, copied
//   deleteBuffer(id)
//   play(voiceId, bufferId, offset, loop, loopStart, loopEnd, rate, routes) -> bool
//   update(voiceId, loop, loopStart, loopEnd, rate, routes)
//   stop(voiceId)
//   setBus(busId, type, maxDelaySeconds, monoInput) -> bool
//   deleteBus(busId)
//   setBusParams(busId, [numbers])            see EJAudioMixerCore.h
//   setBusCurve(busId, Float32Array or null)
//   setBusImpulse(busId, scale, channel0 [, channel1]) or (busId) to clear
//   setBusRoutes(busId, routes)
//   setBusOrder([busIds])
//   getBusReduction(busId) -> dB
//   suspend(), resume()
//   decode(arrayBuffer, callback(sampleRate, [channels...]) or callback(null, error))
//   sampleRate, currentTime
//   onvoiceended = function(voiceId)

#import <AVFoundation/AVFoundation.h>
#import <stdatomic.h>
#import "EJBindingEventedBase.h"
#import "EJAudioMixerCore.h"

@interface EJBindingAudioMixer : EJBindingEventedBase {
	EJAudioMixer *mixer;
	AVAudioEngine *engine;
	AVAudioSourceNode *sourceNode;
	NSTimer *pollTimer;
	NSMutableArray *pendingDecodes;
	BOOL suspended;
	NSTimeInterval lastStartAttempt;
	atomic_bool configurationChanged; // set from any thread by AVAudioEngine
}

@end
