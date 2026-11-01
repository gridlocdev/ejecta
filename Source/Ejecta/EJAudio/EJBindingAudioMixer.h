// Ejecta.AudioMixer is the native half of the Web Audio API in Ejecta.js.
// It plays sample buffers through EJAudioMixerCore on an AVAudioEngine, and
// decodes audio files (decodeAudioData). Ejecta.js builds AudioContext and
// its nodes on top of it; scripts use those, not this class.
//
// JS API:
//   setBuffer(id, sampleRate, channel0 [, channel1])  Float32Arrays, copied
//   deleteBuffer(id)
//   play(voiceId, bufferId, offset, loop, rate, m0, m1, m2, m3) -> bool
//   update(voiceId, loop, rate, m0, m1, m2, m3)
//   stop(voiceId)
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
