// Web Audio and fetch() checks for Ejecta.js, run by `just test-js`.
// Levels come from the simulator's mixer (ctx._mixer._last), which mixes with
// the same math as EJAudioMixerCore.c.

var ctx = new AudioContext();
var results = [];
function check( name, ok, detail ) {
	console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + (detail || '')));
}
function near( a, b ) { return Math.abs(a - b) < 0.01; }
function wait( ms ) { return new Promise(function( r ) { setTimeout(r, ms); }); }
function level() { return ctx._mixer._last || {left: 0, right: 0}; }

function constantBuffer( values, seconds ) {
	var buffer = ctx.createBuffer(values.length, Math.round(seconds * 44100), 44100);
	for( var c = 0; c < values.length; c++ ) { buffer.getChannelData(c).fill(values[c]); }
	return buffer;
}

function play( buffer, nodes, setup ) {
	var source = ctx.createBufferSource();
	source.buffer = buffer;
	var last = source;
	nodes.forEach(function( node ) { last = last.connect(node); });
	last.connect(ctx.destination);
	if( setup ) { setup(source); }
	source.start();
	return source;
}

// A 16-bit mono WAV of a constant level, built in memory
function wavBytes( value, frames, sampleRate ) {
	var buffer = new ArrayBuffer(44 + frames * 2), v = new DataView(buffer);
	var text = function( at, s ) { for( var i = 0; i < s.length; i++ ) { v.setUint8(at + i, s.charCodeAt(i)); } };
	text(0, 'RIFF'); v.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE');
	text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
	v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
	v.setUint16(32, 2, true); v.setUint16(34, 16, true);
	text(36, 'data'); v.setUint32(40, frames * 2, true);
	for( var i = 0; i < frames; i++ ) { v.setInt16(44 + i * 2, value * 32767, true); }
	return buffer;
}

async function run() {
	check('context is running', ctx.state === 'running');
	check('sample rate', ctx.sampleRate > 0);

	var source = play(constantBuffer([.5], 1), [new GainNode(ctx, {gain: .5})]);
	await wait(50);
	check('gain', near(level().left, .25) && near(level().right, .25), JSON.stringify(level()));
	source.stop();

	source = play(constantBuffer([.5], 1), [new StereoPannerNode(ctx, {pan: -1})]);
	await wait(50);
	check('mono pan left', near(level().left, .5) && near(level().right, 0), JSON.stringify(level()));
	source.stop();

	var panner = ctx.createStereoPanner();
	source = play(constantBuffer([.2, .8], 1), [panner]);
	panner.pan.value = 1; // pushed to the playing voice on the next frame
	await wait(50);
	check('stereo pan right', near(level().left, 0) && near(level().right, 1), JSON.stringify(level()));
	source.stop();

	var gain = ctx.createGain();
	source = play(constantBuffer([1], 2), [gain]);
	gain.gain.setValueAtTime(1, ctx.currentTime);
	gain.gain.linearRampToValueAtTime(0, ctx.currentTime + .5);
	await wait(250);
	check('linear ramp halfway', Math.abs(level().left - .5) < .1, JSON.stringify(level()));
	await wait(400);
	check('ramp done', near(level().left, 0) && near(gain.gain.value, 0), JSON.stringify(level()));
	source.stop();

	var ended = 0, start = ctx.currentTime;
	source = play(constantBuffer([.1], .2), [], function( s ) {
		s.playbackRate.value = 2;
		s.onended = function() { ended++; };
		s.addEventListener('ended', function() { ended++; });
	});
	await wait(300);
	check('one-shot ends, both handlers', ended === 2, 'ended ' + ended);
	await wait(10);

	ended = 0;
	source = play(constantBuffer([.1], .05), [], function( s ) {
		s.loop = true;
		s.onended = function() { ended++; };
	});
	await wait(200);
	check('loop keeps playing', ended === 0 && near(level().left, .1));
	source.stop();
	await wait(50);
	check('stop() fires ended', ended === 1);
	check('silent after stop', near(level().left, 0));

	var decoded = await ctx.decodeAudioData(wavBytes(.25, 22050, 22050));
	check('decodeAudioData', decoded.length === 22050 && decoded.sampleRate === 22050 &&
		near(decoded.getChannelData(0)[100], .25), decoded.length + ' ' + decoded.sampleRate);
	source = play(decoded, []);
	await wait(50);
	check('decoded buffer plays', near(level().left, .25), JSON.stringify(level()));
	source.stop();

	var failed = false;
	await ctx.decodeAudioData(new ArrayBuffer(16)).catch(function( e ) { failed = e.name === 'EncodingError'; });
	check('bad data rejects', failed);

	await ctx.suspend();
	var t = ctx.currentTime;
	await wait(100);
	check('suspend stops the clock', ctx.currentTime === t && ctx.state === 'suspended');
	await ctx.resume();
	await wait(100);
	check('resume', ctx.currentTime > t && ctx.state === 'running');

	// Loop points
	var steps = ctx.createBuffer(1, 4410, 44100);
	steps.getChannelData(0).fill(.2, 0, 2205);
	steps.getChannelData(0).fill(.8, 2205);
	source = play(steps, [], function( s ) { s.loop = true; s.loopStart = .05; s.loopEnd = .1; });
	await wait(200);
	check('loops between loopStart and loopEnd', near(level().left, .8), JSON.stringify(level()));
	source.stop();

	// Effects
	var tone = function( hz ) {
		var b = ctx.createBuffer(1, 44100, 44100), d = b.getChannelData(0);
		for( var i = 0; i < d.length; i++ ) { d[i] = Math.sin(2 * Math.PI * hz * i / 44100); }
		return b;
	};
	var peakOver = async function( ms ) {
		var peak = 0;
		for( var t = 0; t < ms; t += 16 ) { await wait(16); peak = Math.max(peak, Math.abs(level().left)); }
		return peak;
	};
	var lowpass = new BiquadFilterNode(ctx, {type: 'lowpass', frequency: 500});
	source = play(tone(8000), [lowpass], function( s ) { s.loop = true; });
	await wait(50);
	check('lowpass stops 8 kHz', await peakOver(200) < .05);
	lowpass.frequency.value = 20000;
	await wait(50);
	check('raising the cutoff lets it through', await peakOver(200) > .5);
	source.stop();

	var magnitude = new Float32Array(2), phase = new Float32Array(2);
	lowpass.frequency.value = 500;
	lowpass.getFrequencyResponse(new Float32Array([100, 10000]), magnitude, phase);
	check('getFrequencyResponse', Math.abs(magnitude[0] - 1) < .05 && magnitude[1] < .01,
		magnitude[0] + ' ' + magnitude[1]);

	var shaper = ctx.createWaveShaper();
	shaper.curve = new Float32Array([-.5, .5]);
	source = play(constantBuffer([1], 1), [shaper]);
	await wait(50);
	check('wave shaper', near(level().left, .5), JSON.stringify(level()));
	source.stop();

	var compressor = ctx.createDynamicsCompressor();
	source = play(tone(200), [compressor], function( s ) { s.loop = true; });
	await wait(200);
	check('compressor reduces a loud signal', compressor.reduction < -10, compressor.reduction);
	source.stop();

	var convolver = new ConvolverNode(ctx, {disableNormalization: true});
	var impulse = ctx.createBuffer(2, 100, ctx.sampleRate);
	impulse.getChannelData(0)[0] = 1;   // left: as is
	impulse.getChannelData(1)[0] = .5;  // right: half
	convolver.buffer = impulse;
	source = play(constantBuffer([.4], 1), [convolver]);
	await wait(100);
	check('convolver spreads mono to its stereo impulse', near(level().left, .4) && near(level().right, .2), JSON.stringify(level()));
	source.stop();
	await wait(100);
	check('convolver tail ends', near(level().left, 0));

	// An echo: delay with feedback through a gain, as LittleJS's AudioDelay does
	var delay = ctx.createDelay(1), feedback = ctx.createGain();
	delay.delayTime.value = .1;
	feedback.gain.value = .5;
	delay.connect(feedback).connect(delay);
	delay.connect(ctx.destination);
	source = ctx.createBufferSource();
	source.buffer = constantBuffer([1], .05);
	source.connect(delay);
	var t0 = ctx.currentTime;
	source.start();
	var echoes = [];
	while( ctx.currentTime - t0 < .45 ) { await wait(5); echoes.push([ctx.currentTime - t0, level().left]); }
	var at = function( t ) {
		var best = echoes.reduce(function( a, b ) { return Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a; });
		return best[1];
	};
	check('delay: first echo', near(at(.125), 1), at(.125));
	check('delay: feedback echo at half', near(at(.23), .5), at(.23));
	check('delay: third echo at a quarter', near(at(.335), .25), at(.335));
	delay.disconnect();

	var oggResponse = await fetch('tone.ogg');
	var ogg = await ctx.decodeAudioData(await oggResponse.arrayBuffer());
	check('decodes Ogg Vorbis', ogg.numberOfChannels === 2 && Math.abs(ogg.length - 22050) < 200 && ogg.sampleRate === 44100,
		ogg.numberOfChannels + ' ' + ogg.length + ' ' + ogg.sampleRate);

	var response = await fetch('data.json');
	var json = await response.json();
	check('fetch json', response.ok && json.hello === 'ejecta');
	response = await fetch('missing.json');
	check('fetch missing local file is 404', !response.ok && response.status === 404);
	response = await fetch('data.json');
	check('fetch text', (await response.text()).indexOf('ejecta') > 0);

	console.log('DONE');
}

var done = false;
run().then(function() { done = true; }, function( e ) { console.log('FAIL exception ' + e + ' ' + e.stack); });
setTimeout(function() { if( !done ) { console.log('FAIL tests did not finish'); } }, 7500);
