#import "EJBindingAudioMixer.h"
#import "EJJavaScriptView.h"
#import "EJNonRetainingProxy.h"
#import "EJAudioDecodeOgg.h"

#define EJ_AUDIO_MIXER_MAX_VOICES 64

// Larger files are refused by decode(); ~1 hour of 48 kHz audio
#define EJ_AUDIO_MIXER_MAX_DECODE_FRAMES (48000 * 60 * 60)


// One decode() in flight. The mixer cancels it if it is garbage collected
// before the decode finishes, so the result is dropped instead of being handed
// to a script view that may be gone.
@interface EJAudioDecodeJob : NSObject {
@public
	JSObjectRef callback;
	BOOL cancelled;
}
@end

@implementation EJAudioDecodeJob
@end


// Reads up to max numbers from a JS array
static int EJReadNumbers(JSContextRef ctx, JSValueRef value, double *out, int max) {
	if( !value || !JSValueIsObject(ctx, value) ) { return 0; }
	JSObjectRef array = JSValueToObject(ctx, value, NULL);
	JSStringRef lengthName = JSStringCreateWithUTF8CString("length");
	int length = (int)JSValueToNumberFast(ctx, JSObjectGetProperty(ctx, array, lengthName, NULL));
	JSStringRelease(lengthName);
	int count = MIN(MAX(length, 0), max);
	for( int i = 0; i < count; i++ ) {
		out[i] = JSValueToNumberFast(ctx, JSObjectGetPropertyAtIndex(ctx, array, i, NULL));
	}
	return count;
}

// Reads a flat [target, m0, m1, m2, m3, ...] array
static int EJReadRoutes(JSContextRef ctx, JSValueRef value, EJAudioRoute *routes) {
	double numbers[EJ_AUDIO_MAX_ROUTES * 5];
	int count = EJReadNumbers(ctx, value, numbers, EJ_AUDIO_MAX_ROUTES * 5) / 5;
	for( int i = 0; i < count; i++ ) {
		double *n = numbers + i * 5;
		routes[i].target = isfinite(n[0]) ? (int)n[0] : -1;
		for( int k = 0; k < 4; k++ ) { routes[i].matrix[k] = (float)n[k + 1]; }
	}
	return count;
}

// Float32Array arguments as channel pointers; returns the shortest length
static int EJReadChannels(JSContextRef ctx, const JSValueRef argv[], int argc, const float **channels) {
	size_t length = SIZE_MAX;
	for( int i = 0; i < argc; i++ ) {
		if( JSValueGetTypedArrayType(ctx, argv[i], NULL) != kJSTypedArrayTypeFloat32Array ) { return 0; }
		size_t byteLength = 0;
		channels[i] = JSValueGetTypedArrayPtr(ctx, argv[i], &byteLength);
		if( !channels[i] ) { return 0; }
		length = MIN(length, byteLength / sizeof(float));
	}
	return (argc > 0 && length < INT_MAX) ? (int)length : 0;
}


@implementation EJBindingAudioMixer

- (id)initWithContext:(JSContextRef)ctx argc:(size_t)argc argv:(const JSValueRef [])argv {
	if( self = [super initWithContext:ctx argc:argc argv:argv] ) {
		pendingDecodes = [[NSMutableArray alloc] init];
		engine = [[AVAudioEngine alloc] init];

		double sampleRate = [engine.outputNode outputFormatForBus:0].sampleRate;
		mixer = EJAudioMixerCreate(sampleRate > 0 ? sampleRate : 48000, EJ_AUDIO_MIXER_MAX_VOICES);

		// The render block runs on the audio thread. It only touches the C
		// mixer, never self.
		EJAudioMixer *core = mixer;
		AVAudioFormat *format = [[AVAudioFormat alloc]
			initStandardFormatWithSampleRate:EJAudioMixerGetOutputSampleRate(mixer) channels:2];
		sourceNode = [[AVAudioSourceNode alloc] initWithFormat:format renderBlock:
			^OSStatus(BOOL *isSilence, const AudioTimeStamp *timestamp,
				AVAudioFrameCount frameCount, AudioBufferList *outputData
			) {
				if( outputData->mNumberBuffers < 2 ) {
					for( UInt32 i = 0; i < outputData->mNumberBuffers; i++ ) {
						memset(outputData->mBuffers[i].mData, 0, outputData->mBuffers[i].mDataByteSize);
					}
					*isSilence = YES;
					return noErr;
				}
				EJAudioMixerRender(core,
					(float *)outputData->mBuffers[0].mData,
					(float *)outputData->mBuffers[1].mData,
					(int)frameCount);
				return noErr;
			}];
		[engine attachNode:sourceNode];
		// The main mixer converts from this format to whatever the output
		// is, so this connection never has to change
		[engine connect:sourceNode to:engine.mainMixerNode format:format];
		[format release];

		[self startEngine];

		// A route change (HDMI, AirPlay, headphones) stops the engine. The
		// notification can come on any thread; poll does the work.
		[NSNotificationCenter.defaultCenter addObserver:self selector:@selector(engineConfigurationChanged:)
			name:AVAudioEngineConfigurationChangeNotification object:engine];

		// Ended voices are collected on the main thread, where JS runs
		pollTimer = [[NSTimer timerWithTimeInterval:1.0/60.0
			target:[EJNonRetainingProxy proxyWithTarget:self]
			selector:@selector(poll) userInfo:nil repeats:YES] retain];
		[NSRunLoop.mainRunLoop addTimer:pollTimer forMode:NSRunLoopCommonModes];
	}
	return self;
}

- (void)prepareGarbageCollection {
	[pollTimer invalidate];
	[pollTimer release];
	pollTimer = nil;
	[NSNotificationCenter.defaultCenter removeObserver:self];
	[engine stop];

	for( EJAudioDecodeJob *job in pendingDecodes ) {
		job->cancelled = YES;
		JSValueUnprotectSafe(scriptView.jsGlobalContext, job->callback);
	}
	[pendingDecodes removeAllObjects];

	[super prepareGarbageCollection];
}

- (void)dealloc {
	[pollTimer invalidate];
	[pollTimer release];
	[NSNotificationCenter.defaultCenter removeObserver:self];
	[engine stop]; // no more renders after this, so the mixer can go
	[sourceNode release];
	[engine release];
	[pendingDecodes release];
	EJAudioMixerDestroy(mixer);
	[super dealloc];
}

- (BOOL)shouldRun {
	// Ejecta pauses when the app isn't active and deactivates the audio
	// session; the engine stays off until it resumes.
	return !suspended && !(scriptView && scriptView.isPaused);
}

- (void)startEngine {
	if( ![self shouldRun] || engine.isRunning ) { return; }
	lastStartAttempt = NSDate.timeIntervalSinceReferenceDate;
	NSError *error = nil;
	if( ![engine startAndReturnError:&error] ) {
		NSLog(@"AudioMixer: could not start the audio engine: %@", error);
	}
}

- (void)engineConfigurationChanged:(NSNotification *)notification {
	atomic_store(&configurationChanged, true);
}

- (void)poll {
	if( atomic_exchange(&configurationChanged, false) ) {
		// The output may have a new channel count or sample rate now
		[engine connect:engine.mainMixerNode to:engine.outputNode
			format:[engine.outputNode outputFormatForBus:0]];
		lastStartAttempt = 0;
	}

	if( ![self shouldRun] ) {
		if( engine.isRunning ) { [engine pause]; }
	}
	else if( !engine.isRunning && NSDate.timeIntervalSinceReferenceDate - lastStartAttempt > 1 ) {
		// Retry once a second, e.g. after an interruption
		[self startEngine];
	}

	if( !scriptView ) { return; }
	JSContextRef ctx = scriptView.jsGlobalContext;
	int ids[64];
	int count;
	do {
		count = EJAudioMixerTakeEnded(mixer, ids, 64);
		for( int i = 0; i < count; i++ ) {
			JSValueRef arg = JSValueMakeNumber(ctx, ids[i]);
			[self triggerEvent:@"voiceended" argc:1 argv:&arg];
		}
	} while( count == 64 );
}


// Writes data to a temporary file named for its format, so AVAudioFile picks
// the right decoder, and reads it as float samples. Returns a retained buffer.
+ (AVAudioPCMBuffer *)newBufferWithData:(NSData *)data error:(NSString **)errorMessage {
	const uint8_t *b = data.bytes;
	NSUInteger n = data.length;
	
	// AVAudioFile doesn't read Ogg Vorbis; stb_vorbis does
	EJDecodedAudio ogg;
	if( n < INT_MAX && EJAudioDecodeOggVorbis(b, (int)n, &ogg) ) {
		AVAudioFormat *format = [[AVAudioFormat alloc]
			initStandardFormatWithSampleRate:ogg.sampleRate channels:(AVAudioChannelCount)ogg.channelCount];
		AVAudioPCMBuffer *buffer = format
			? [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:(AVAudioFrameCount)ogg.frames]
			: nil;
		if( buffer ) {
			for( int c = 0; c < ogg.channelCount; c++ ) {
				memcpy(buffer.floatChannelData[c], ogg.channels[c], ogg.frames * sizeof(float));
			}
			buffer.frameLength = (AVAudioFrameCount)ogg.frames;
		}
		[format release];
		EJDecodedAudioFree(&ogg);
		if( !buffer ) { *errorMessage = @"not enough memory for the decoded audio"; }
		return buffer;
	}
	NSString *extension = @"audio";
	if( n >= 12 && !memcmp(b, "RIFF", 4) ) { extension = @"wav"; }
	else if( n >= 4 && !memcmp(b, "OggS", 4) ) { extension = @"ogg"; }
	else if( n >= 4 && !memcmp(b, "fLaC", 4) ) { extension = @"flac"; }
	else if( n >= 4 && !memcmp(b, "caff", 4) ) { extension = @"caf"; }
	else if( n >= 4 && !memcmp(b, "FORM", 4) ) { extension = @"aiff"; }
	else if( n >= 8 && !memcmp(b + 4, "ftyp", 4) ) { extension = @"m4a"; }
	else if( n >= 3 && !memcmp(b, "ID3", 3) ) { extension = @"mp3"; }
	else if( n >= 2 && b[0] == 0xFF && (b[1] & 0xF6) == 0xF0 ) { extension = @"aac"; } // ADTS
	else if( n >= 2 && b[0] == 0xFF && (b[1] & 0xE0) == 0xE0 ) { extension = @"mp3"; }

	NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:
		[NSString stringWithFormat:@"ejecta-decode-%@.%@", NSUUID.UUID.UUIDString, extension]];
	if( ![data writeToFile:path atomically:NO] ) {
		*errorMessage = @"could not write a temporary file";
		return nil;
	}

	NSError *error = nil;
	AVAudioPCMBuffer *buffer = nil;
	AVAudioFile *file = [[AVAudioFile alloc] initForReading:[NSURL fileURLWithPath:path]
		commonFormat:AVAudioPCMFormatFloat32 interleaved:NO error:&error];
	if( file && file.length > EJ_AUDIO_MIXER_MAX_DECODE_FRAMES ) {
		*errorMessage = @"the file is too long to decode into memory";
	}
	else if( file && file.length > 0 ) {
		buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:file.processingFormat
			frameCapacity:(AVAudioFrameCount)file.length];
		if( buffer && ![file readIntoBuffer:buffer error:&error] ) {
			[buffer release];
			buffer = nil;
		}
	}
	[file release];
	[NSFileManager.defaultManager removeItemAtPath:path error:NULL];

	if( !buffer && !*errorMessage ) {
		*errorMessage = error
			? [NSString stringWithFormat:@"could not decode %@ audio: %@", extension, error.localizedDescription]
			: @"no audio data, or not enough memory";
	}
	return buffer;
}

- (void)finishDecode:(EJAudioDecodeJob *)job buffer:(AVAudioPCMBuffer *)buffer error:(NSString *)errorMessage {
	if( job->cancelled ) { return; }

	JSContextRef ctx = scriptView.jsGlobalContext;
	JSValueRef args[2];

	AVAudioChannelCount channelCount = buffer ? buffer.format.channelCount : 0;
	AVAudioFrameCount frames = buffer ? buffer.frameLength : 0;
	JSValueRef channels[channelCount > 0 ? channelCount : 1];
	for( AVAudioChannelCount i = 0; i < channelCount; i++ ) {
		JSObjectRef array = JSObjectMakeTypedArray(ctx, kJSTypedArrayTypeFloat32Array, frames, NULL);
		void *bytes = array ? JSObjectGetTypedArrayBytesPtr(ctx, array, NULL) : NULL;
		if( !bytes ) {
			channelCount = 0;
			errorMessage = @"not enough memory for the decoded audio";
			break;
		}
		memcpy(bytes, buffer.floatChannelData[i], frames * sizeof(float));
		channels[i] = array;
	}

	if( channelCount ) {
		args[0] = JSValueMakeNumber(ctx, buffer.format.sampleRate);
		args[1] = JSObjectMakeArray(ctx, channelCount, channels, NULL);
	}
	else {
		args[0] = JSValueMakeNull(ctx);
		args[1] = NSStringToJSValue(ctx, errorMessage ?: @"could not decode audio");
	}
	[scriptView invokeCallback:job->callback thisObject:NULL argc:2 argv:args];
	JSValueUnprotectSafe(ctx, job->callback);
	[pendingDecodes removeObject:job];
}


EJ_BIND_FUNCTION(setBuffer, ctx, argc, argv) {
	if( argc < 3 ) { return JSValueMakeBoolean(ctx, false); }

	int bufferId = (int)JSValueToNumberFast(ctx, argv[0]);
	double sampleRate = JSValueToNumberFast(ctx, argv[1]);
	int channelCount = MIN((int)argc - 2, 2);
	const float *channels[2] = {NULL, NULL};
	int length = EJReadChannels(ctx, argv + 2, channelCount, channels);
	
	BOOL ok = length > 0 &&
		EJAudioMixerSetBuffer(mixer, bufferId, channels, channelCount, length, sampleRate);
	return JSValueMakeBoolean(ctx, ok);
}

EJ_BIND_FUNCTION(deleteBuffer, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	EJAudioMixerDeleteBuffer(mixer, (int)JSValueToNumberFast(ctx, argv[0]));
	return NULL;
}

EJ_BIND_FUNCTION(play, ctx, argc, argv) {
	if( argc < 8 ) { return JSValueMakeBoolean(ctx, false); }
	EJAudioRoute routes[EJ_AUDIO_MAX_ROUTES];
	int routeCount = EJReadRoutes(ctx, argv[7], routes);
	BOOL ok = EJAudioMixerPlay(mixer,
		(int)JSValueToNumberFast(ctx, argv[0]),
		(int)JSValueToNumberFast(ctx, argv[1]),
		JSValueToNumberFast(ctx, argv[2]),
		JSValueToBoolean(ctx, argv[3]),
		JSValueToNumberFast(ctx, argv[4]),
		JSValueToNumberFast(ctx, argv[5]),
		JSValueToNumberFast(ctx, argv[6]),
		routes, routeCount);
	return JSValueMakeBoolean(ctx, ok);
}

EJ_BIND_FUNCTION(update, ctx, argc, argv) {
	if( argc < 6 ) { return NULL; }
	EJAudioRoute routes[EJ_AUDIO_MAX_ROUTES];
	int routeCount = EJReadRoutes(ctx, argv[5], routes);
	EJAudioMixerUpdate(mixer,
		(int)JSValueToNumberFast(ctx, argv[0]),
		JSValueToBoolean(ctx, argv[1]),
		JSValueToNumberFast(ctx, argv[2]),
		JSValueToNumberFast(ctx, argv[3]),
		JSValueToNumberFast(ctx, argv[4]),
		routes, routeCount);
	return NULL;
}

EJ_BIND_FUNCTION(stop, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	EJAudioMixerStop(mixer, (int)JSValueToNumberFast(ctx, argv[0]));
	return NULL;
}

EJ_BIND_FUNCTION(setBus, ctx, argc, argv) {
	if( argc < 4 ) { return JSValueMakeBoolean(ctx, false); }
	BOOL ok = EJAudioMixerSetBus(mixer,
		(int)JSValueToNumberFast(ctx, argv[0]),
		(int)JSValueToNumberFast(ctx, argv[1]),
		JSValueToNumberFast(ctx, argv[2]),
		JSValueToBoolean(ctx, argv[3]));
	return JSValueMakeBoolean(ctx, ok);
}

EJ_BIND_FUNCTION(deleteBus, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	EJAudioMixerDeleteBus(mixer, (int)JSValueToNumberFast(ctx, argv[0]));
	return NULL;
}

EJ_BIND_FUNCTION(setBusParams, ctx, argc, argv) {
	if( argc < 2 ) { return NULL; }
	double params[8];
	int count = EJReadNumbers(ctx, argv[1], params, 8);
	EJAudioMixerSetBusParams(mixer, (int)JSValueToNumberFast(ctx, argv[0]), params, count);
	return NULL;
}

EJ_BIND_FUNCTION(setBusCurve, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	const float *curve = NULL;
	int length = argc > 1 ? EJReadChannels(ctx, argv + 1, 1, &curve) : 0;
	EJAudioMixerSetBusCurve(mixer, (int)JSValueToNumberFast(ctx, argv[0]), length ? curve : NULL, length);
	return NULL;
}

EJ_BIND_FUNCTION(setBusImpulse, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	int busId = (int)JSValueToNumberFast(ctx, argv[0]);
	int channelCount = argc > 2 ? MIN((int)argc - 2, 2) : 0;
	const float *channels[2] = {NULL, NULL};
	int length = channelCount ? EJReadChannels(ctx, argv + 2, channelCount, channels) : 0;
	float scale = argc > 1 ? JSValueToNumberFast(ctx, argv[1]) : 1;
	EJAudioMixerSetBusImpulse(mixer, busId, length ? channels : NULL, channelCount, length, scale);
	return NULL;
}

EJ_BIND_FUNCTION(setBusRoutes, ctx, argc, argv) {
	if( argc < 2 ) { return NULL; }
	EJAudioRoute routes[EJ_AUDIO_MAX_ROUTES];
	int routeCount = EJReadRoutes(ctx, argv[1], routes);
	EJAudioMixerSetBusRoutes(mixer, (int)JSValueToNumberFast(ctx, argv[0]), routes, routeCount);
	return NULL;
}

EJ_BIND_FUNCTION(setBusOrder, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	double numbers[EJ_AUDIO_MAX_BUSES];
	int ids[EJ_AUDIO_MAX_BUSES];
	int count = EJReadNumbers(ctx, argv[0], numbers, EJ_AUDIO_MAX_BUSES);
	for( int i = 0; i < count; i++ ) { ids[i] = isfinite(numbers[i]) ? (int)numbers[i] : 0; }
	EJAudioMixerSetBusOrder(mixer, ids, count);
	return NULL;
}

EJ_BIND_FUNCTION(getBusReduction, ctx, argc, argv) {
	if( argc < 1 ) { return JSValueMakeNumber(ctx, 0); }
	return JSValueMakeNumber(ctx, EJAudioMixerGetBusReduction(mixer, (int)JSValueToNumberFast(ctx, argv[0])));
}

EJ_BIND_FUNCTION(suspend, ctx, argc, argv) {
	suspended = YES;
	[engine pause];
	return NULL;
}

EJ_BIND_FUNCTION(resume, ctx, argc, argv) {
	suspended = NO;
	[self startEngine];
	return NULL;
}

EJ_BIND_FUNCTION(decode, ctx, argc, argv) {
	if( argc < 2 ) { return NULL; }
	JSObjectRef callback = JSValueToObject(ctx, argv[1], NULL);
	if( !callback || !JSObjectIsFunction(ctx, callback) ) { return NULL; }

	size_t length = 0;
	void *bytes = JSValueGetTypedArrayPtr(ctx, argv[0], &length);
	NSData *data = [NSData dataWithBytes:bytes length:(bytes ? length : 0)];

	EJAudioDecodeJob *job = [[EJAudioDecodeJob alloc] init];
	job->callback = callback;
	JSValueProtect(ctx, callback);
	[pendingDecodes addObject:job];
	[job release]; // pendingDecodes and the blocks below hold it

	// The blocks must not retain self: under MRC a __block object pointer is
	// not retained. The job tells the completion whether self is still there.
	__block EJBindingAudioMixer *unretainedSelf = self;

	dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
		AVAudioPCMBuffer *buffer = nil;
		NSString *errorMessage = nil;
		@autoreleasepool {
			buffer = [EJBindingAudioMixer newBufferWithData:data error:&errorMessage];
			[errorMessage retain];
		}

		dispatch_async(dispatch_get_main_queue(), ^{
			if( !job->cancelled ) {
				[unretainedSelf finishDecode:job buffer:buffer error:errorMessage];
			}
			[buffer release];
			[errorMessage release];
		});
	});
	return NULL;
}

EJ_BIND_GET(sampleRate, ctx) {
	return JSValueMakeNumber(ctx, EJAudioMixerGetOutputSampleRate(mixer));
}

EJ_BIND_GET(currentTime, ctx) {
	return JSValueMakeNumber(ctx, EJAudioMixerGetTime(mixer));
}

EJ_BIND_EVENT(voiceended);

@end
