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
setTimeout(function() { if( !done ) { console.log('FAIL tests did not finish'); } }, 3500);
