// Tests that run inside Ejecta on a tvOS Simulator or device: real canvas
// rendering, WebGL, audio and file loading. tools/device-tests/run_sim.py runs
// them in CI and reads the console: PASS, FAIL and SKIP lines, then DONE.

var results = {pass: 0, fail: 0};
function check( name, ok, detail ) {
	results[ok ? 'pass' : 'fail']++;
	console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : ' -- ' + detail));
}
function skip( name, why ) { console.log('SKIP ' + name + ' -- ' + why); }
function wait( ms ) { return new Promise(function( r ) { setTimeout(r, ms); }); }
function near( a, b, tolerance ) { return Math.abs(a - b) <= (tolerance || 2); }
function rgba( data, i ) { i = (i || 0) * 4; return [data[i], data[i+1], data[i+2], data[i+3]]; }
function same( a, b, tolerance ) {
	for( var i = 0; i < 4; i++ ) { if( !near(a[i], b[i], tolerance) ) { return false; } }
	return true;
}

function canvasTests() {
	var canvas = document.createElement('canvas');
	canvas.width = canvas.height = 16;
	var ctx = canvas.getContext('2d');

	ctx.fillStyle = '#ff0000';
	ctx.fillRect(0, 0, 16, 16);
	var px = rgba(ctx.getImageData(8, 8, 1, 1).data);
	check('2d fillRect', same(px, [255, 0, 0, 255]), px);

	ctx.clearRect(0, 0, 16, 16);
	ctx.fillStyle = '#0000ff';
	ctx.beginPath();
	ctx.ellipse(8, 8, 7, 3, 0, 0, Math.PI * 2);
	ctx.fill();
	var inside = rgba(ctx.getImageData(8, 8, 1, 1).data);
	var outside = rgba(ctx.getImageData(8, 1, 1, 1).data);
	check('2d ellipse', inside[2] > 200 && outside[3] < 20, inside + ' / ' + outside);

	ctx.clearRect(0, 0, 16, 16);
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 2;
	ctx.setLineDash([4, 4]);
	ctx.beginPath();
	ctx.moveTo(0, 8);
	ctx.lineTo(16, 8);
	ctx.stroke();
	var row = ctx.getImageData(0, 8, 16, 1).data;
	var dash = rgba(row, 1), gap = rgba(row, 5), dash2 = rgba(row, 9);
	check('2d dashed line', dash[3] > 200 && gap[3] < 50 && dash2[3] > 200, dash + ' / ' + gap + ' / ' + dash2);
	check('2d getLineDash', ctx.getLineDash().join() === '4,4', ctx.getLineDash());
}

function compileProgram( gl, vs, fs ) {
	var program = gl.createProgram();
	[[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(function( s ) {
		var shader = gl.createShader(s[0]);
		gl.shaderSource(shader, s[1]);
		gl.compileShader(shader);
		if( !gl.getShaderParameter(shader, gl.COMPILE_STATUS) ) {
			throw new Error('shader: ' + gl.getShaderInfoLog(shader));
		}
		gl.attachShader(program, shader);
	});
	gl.linkProgram(program);
	if( !gl.getProgramParameter(program, gl.LINK_STATUS) ) {
		throw new Error('link: ' + gl.getProgramInfoLog(program));
	}
	return program;
}

function webglTests() {
	var canvas = document.createElement('canvas');
	canvas.width = canvas.height = 8;
	var gl = canvas.getContext('webgl');
	if( !gl ) { return check('webgl context', false); }

	gl.clearColor(0, 1, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);
	var px = new Uint8Array(4);
	gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
	check('webgl clear', same(rgba(px), [0, 255, 0, 255]), rgba(px));

	try {
		var program = compileProgram(gl,
			'attribute vec2 p; void main(){ gl_Position = vec4(p, 0, 1); }',
			'precision mediump float; void main(){ gl_FragColor = vec4(1, 0, 0, 1); }');
		gl.useProgram(program);
		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		var at = gl.getAttribLocation(program, 'p');
		gl.enableVertexAttribArray(at);
		gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
		check('webgl triangle', same(rgba(px), [255, 0, 0, 255]), rgba(px));

		// subarray(): native code must read from the view, not the buffer start
		var data = new Float32Array([9, 9, 9, 9, -1, -1, 3, -1, -1, 3]);
		gl.bufferData(gl.ARRAY_BUFFER, data.subarray(4), gl.STATIC_DRAW);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
		check('webgl bufferData(subarray)', same(rgba(px), [255, 0, 0, 255]), rgba(px));
	}
	catch( e ) { check('webgl draw', false, e.message); }

	// Draw a WebGL canvas into a 2D canvas
	var target = document.createElement('canvas');
	target.width = target.height = 8;
	var ctx = target.getContext('2d');
	ctx.drawImage(canvas, 0, 0);
	var copied = rgba(ctx.getImageData(4, 4, 1, 1).data);
	check('webgl canvas drawn into 2d', same(copied, [255, 0, 0, 255], 4), copied);
}

function webgl2Tests() {
	var canvas = document.createElement('canvas');
	canvas.width = canvas.height = 8;
	var gl = canvas.getContext('webgl2');
	if( !gl ) { return skip('webgl2', 'getContext("webgl2") returned null'); }
	check('webgl2 context', typeof gl.drawArraysInstanced === 'function' && typeof gl.createVertexArray === 'function');

	try {
		// GLSL ES 3.00 with fixed attribute locations, instancing and a VAO:
		// two instances, each covering half of the canvas
		var program = compileProgram(gl,
			'#version 300 es\n' +
			'precision highp float;' +
			'layout(location=0) in vec2 g;' +
			'layout(location=1) in vec4 c;' +
			'out vec4 color;' +
			'void main(){ color = c; gl_Position = vec4(g.x * .5 + (c.a > .75 ? .5 : -.5), g.y, 0, 1); }',
			'#version 300 es\n' +
			'precision highp float;' +
			'uniform sampler2D s;' +
			'in vec4 color;' +
			'out vec4 o;' +
			'void main(){ o = vec4(color.rgb, 1) + texture(s, vec2(.5)) * 0.0; }');
		gl.useProgram(program);
		var vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		var quad = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, quad);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		var colors = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, colors);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 0, 0, .5, 0, 0, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(1, 1);
		gl.bindVertexArray(null);

		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.bindVertexArray(vao);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 2);
		var left = new Uint8Array(4), right = new Uint8Array(4);
		gl.readPixels(1, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, left);
		gl.readPixels(6, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, right);
		check('webgl2 instanced draw with layout locations', same(rgba(left), [255, 0, 0, 255]) && same(rgba(right), [0, 0, 255, 255]),
			rgba(left) + ' / ' + rgba(right));
	}
	catch( e ) { check('webgl2 draw', false, e.message); }
}

async function audioTests() {
	var ctx = new AudioContext();
	var t = ctx.currentTime;
	await wait(500);
	check('audio clock runs', ctx.currentTime - t > .3, (ctx.currentTime - t) + ' s in 0.5 s');
	check('audio sample rate', ctx.sampleRate >= 22050, ctx.sampleRate);

	var ended = false;
	var buffer = ctx.createBuffer(1, 4410, 44100);
	buffer.getChannelData(0).fill(.1);
	var source = ctx.createBufferSource();
	source.buffer = buffer;
	var filter = ctx.createBiquadFilter();
	var reverb = ctx.createConvolver();
	var impulse = ctx.createBuffer(2, 4410, 44100);
	impulse.getChannelData(0)[0] = impulse.getChannelData(1)[100] = 1;
	reverb.buffer = impulse;
	source.connect(filter).connect(reverb).connect(ctx.destination);
	source.onended = function() { ended = true; };
	source.start();
	await wait(400);
	check('audio source ends through effects', ended);

	var response = await fetch('tone.ogg');
	var decoded = await ctx.decodeAudioData(await response.arrayBuffer());
	check('decode Ogg Vorbis', decoded.numberOfChannels === 2 && near(decoded.length, 22050, 200),
		decoded.numberOfChannels + ' ' + decoded.length);
}

async function fetchTests() {
	var json = await (await fetch('data.json')).json();
	check('fetch json', json.hello === 'ejecta');
	var missing = await fetch('nope.json');
	check('fetch missing file is 404', missing.status === 404);
}

async function run() {
	console.log('Ejecta device tests: ' + navigator.userAgent);
	var steps = [canvasTests, webglTests, webgl2Tests, audioTests, fetchTests];
	for( var i = 0; i < steps.length; i++ ) {
		try { await steps[i](); }
		catch( e ) { check(steps[i].name, false, e + ' ' + e.stack); }
	}
	console.log('DONE ' + results.pass + ' passed, ' + results.fail + ' failed');
}

setTimeout(run, 500);
