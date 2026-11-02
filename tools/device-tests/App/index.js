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
// Exactly the same values, as many of them
function equal( a, b ) {
	a = Array.from(a || []);
	return a.length === b.length && a.every(function( v, i ) { return v === b[i]; });
}
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

	// Hex colors with alpha, as LittleJS writes every color
	ctx.clearRect(0, 0, 16, 16);
	ctx.fillStyle = '#00ff0080';
	ctx.fillRect(0, 0, 8, 16);
	ctx.fillStyle = '#00f8';
	ctx.fillRect(8, 0, 8, 16);
	var long = rgba(ctx.getImageData(4, 8, 1, 1).data), short = rgba(ctx.getImageData(12, 8, 1, 1).data);
	check('2d hex colors with alpha', same(long, [0, 255, 0, 128], 3) && same(short, [0, 0, 255, 136], 3),
		long + ' / ' + short);

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

function compileProgram( gl, vs, fs, beforeLink ) {
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
	if( beforeLink ) { beforeLink(program); }
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

	console.log('INFO webgl: ' + gl.getParameter(gl.VERSION) + ', ' + gl.getParameter(gl.RENDERER) +
		', framebuffer ' + (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE ? 'complete' : 'incomplete'));
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

	// Draw a WebGL canvas into a 2D canvas: top half (GL y 4..8) red,
	// bottom half green, so a flip would show
	gl.enable(gl.SCISSOR_TEST);
	gl.scissor(0, 0, 8, 4);
	gl.clearColor(0, 1, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.scissor(0, 4, 8, 4);
	gl.clearColor(1, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.disable(gl.SCISSOR_TEST);
	var target = document.createElement('canvas');
	target.width = target.height = 8;
	var ctx = target.getContext('2d');
	ctx.drawImage(canvas, 0, 0);
	var top = rgba(ctx.getImageData(4, 1, 1, 1).data), bottom = rgba(ctx.getImageData(4, 6, 1, 1).data);
	check('webgl canvas drawn into 2d, upright', same(top, [255, 0, 0, 255], 4) && same(bottom, [0, 255, 0, 255], 4),
		top + ' / ' + bottom);
}

function webgl2Tests() {
	var canvas = document.createElement('canvas');
	canvas.width = canvas.height = 8;
	var gl = canvas.getContext('webgl2');
	if( !gl ) { return skip('webgl2', 'getContext("webgl2") returned null'); }
	var firstError = gl.getError();
	check('webgl2 new context has no GL error', firstError === gl.NO_ERROR, '0x' + firstError.toString(16));
	check('webgl2 context', typeof gl.drawArraysInstanced === 'function' && typeof gl.createVertexArray === 'function');
	check('webgl2 version', /^WebGL 2\.0/.test(gl.getParameter(gl.VERSION)) &&
		/^WebGL GLSL ES 3\.00/.test(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
		gl.getParameter(gl.VERSION) + ' / ' + gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
	check('webgl2 has no WebGL 1 extensions that are core', gl.getExtension('OES_vertex_array_object') === null);
	check('webgl2 canvas has no webgl context', canvas.getContext('webgl') === null);

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
		check('webgl2 vertex array binding', gl.getParameter(gl.VERTEX_ARRAY_BINDING) === vao);
		gl.bindVertexArray(null);
		check('webgl2 unbinds the vertex array', gl.getParameter(gl.VERTEX_ARRAY_BINDING) === null,
			gl.getParameter(gl.VERTEX_ARRAY_BINDING));

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

	try {
		// GLSL ES 3.00 that has no GLSL 1.00 equivalent: unsigned integers,
		// bit operations, texelFetch and textureSize
		var program3 = compileProgram(gl,
			'#version 300 es\n' +
			'in vec2 p;' +
			'void main(){ gl_Position = vec4(p, 0, 1); }',
			'#version 300 es\n' +
			'precision highp float;' +
			'uniform sampler2D s;' +
			'out vec4 o;' +
			'void main(){' +
			'  uint bits = 5u & 3u;' +
			'  ivec2 size = textureSize(s, 0);' +
			'  vec4 texel = texelFetch(s, ivec2(0), 0);' +
			'  o = vec4(float(bits), float(size.x) / 6.0, texel.r, 1);' +
			'}');
		check('webgl2 links GLSL 3.00 as is', gl.getProgramParameter(program3, gl.LINK_STATUS) === true);
		gl.bindVertexArray(null);
		gl.useProgram(program3);
		var full = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, full);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		var p3 = gl.getAttribLocation(program3, 'p');
		gl.enableVertexAttribArray(p3);
		gl.vertexAttribPointer(p3, 2, gl.FLOAT, false, 0, 0);
		var texture3 = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture3);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 3, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
			new Uint8Array([255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]));
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		var integers = new Uint8Array(4);
		gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, integers);
		check('webgl2 integers, texelFetch, textureSize', same(rgba(integers), [255, 128, 255, 255]), rgba(integers));
		gl.disableVertexAttribArray(p3);
	}
	catch( e ) { check('webgl2 integers, texelFetch, textureSize', false, e.message); }

	try {
		// A texture whose sides aren't powers of two, mipmapped as LittleJS
		// does for smooth textures: WebGL 1 would sample it as black
		var source = document.createElement('canvas');
		source.width = 6;
		source.height = 2;
		var sourceContext = source.getContext('2d');
		sourceContext.fillStyle = '#ff0000';
		sourceContext.fillRect(0, 0, 6, 2);
		gl.bindVertexArray(null);
		var textured = compileProgram(gl,
			'attribute vec2 p; varying vec2 uv; void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0, 1); }',
			'precision mediump float; uniform sampler2D s; varying vec2 uv; void main(){ gl_FragColor = texture2D(s, uv); }');
		gl.useProgram(textured);
		var triangle = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		var at = gl.getAttribLocation(textured, 'p');
		gl.enableVertexAttribArray(at);
		gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
		gl.activeTexture(gl.TEXTURE0);
		var texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.clearColor(0, 0, 1, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		var npot = new Uint8Array(4);
		gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, npot);
		check('webgl2 mipmapped texture of any size', same(rgba(npot), [255, 0, 0, 255]), rgba(npot));
	}
	catch( e ) { check('webgl2 mipmapped texture of any size', false, e.message); }
}

// Draws a full canvas triangle with a GLSL 3.00 fragment shader, and returns
// the pixel in the middle
function drawFragment( gl, fragment ) {
	var program = compileProgram(gl,
		'#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0, 1); }',
		'#version 300 es\nprecision highp float; precision highp sampler3D; precision highp sampler2DArray;' +
		'layout(location=0) out vec4 o;' + fragment);
	gl.useProgram(program);
	var buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	var at = gl.getAttribLocation(program, 'p');
	gl.enableVertexAttribArray(at);
	gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.drawArrays(gl.TRIANGLES, 0, 3);
	var pixel = new Uint8Array(4);
	gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
	gl.disableVertexAttribArray(at);
	gl.deleteBuffer(buffer);
	gl.deleteProgram(program);
	return rgba(pixel);
}

function nearest( gl, target ) {
	gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

function webgl2TextureTests() {
	var canvas = document.createElement('canvas');
	canvas.width = canvas.height = 8;
	var gl = canvas.getContext('webgl2');
	if( !gl ) { return skip('webgl2 textures', 'getContext("webgl2") returned null'); }

	function test( name, fn ) {
		try { fn(); }
		catch( e ) { check(name, false, e.message); }
	}

	test('webgl2 3D texture', function() {
		var texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_3D, texture);
		gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE,
			new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]));
		nearest(gl, gl.TEXTURE_3D);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
		check('webgl2 3D texture binding', gl.getParameter(gl.TEXTURE_BINDING_3D) === texture);
		check('webgl2 TEXTURE_WRAP_R', gl.getTexParameter(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R) === gl.CLAMP_TO_EDGE,
			gl.getTexParameter(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R));
		var layer = drawFragment(gl, 'uniform sampler3D s; void main(){ o = texture(s, vec3(.5, .5, .75)); }');
		check('webgl2 3D texture', same(layer, [0, 255, 0, 255]), layer);
		gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE,
			new Uint8Array([0, 0, 255, 255]));
		var changed = drawFragment(gl, 'uniform sampler3D s; void main(){ o = texelFetch(s, ivec3(0, 0, 1), 0); }');
		check('webgl2 texSubImage3D', same(changed, [0, 0, 255, 255]), changed);
		gl.bindTexture(gl.TEXTURE_3D, null);
		check('webgl2 unbinds the 3D texture', gl.getParameter(gl.TEXTURE_BINDING_3D) === null);
	});

	test('webgl2 2D array texture', function() {
		var texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
		gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 1, 1, 3);
		gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, 1, 1, 3, gl.RGBA, gl.UNSIGNED_BYTE,
			new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 255, 255, 0, 255]));
		nearest(gl, gl.TEXTURE_2D_ARRAY);
		check('webgl2 texStorage3D is immutable', gl.getTexParameter(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_IMMUTABLE_FORMAT) === true);
		var layer = drawFragment(gl, 'uniform sampler2DArray s; void main(){ o = texture(s, vec3(.5, .5, 2)); }');
		check('webgl2 2D array texture', same(layer, [255, 255, 0, 255]), layer);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
	});

	test('webgl2 float textures', function() {
		var half = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, half);
		// 0.5 and 1.0 as half floats
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, 1, 1, 0, gl.RG, gl.HALF_FLOAT, new Uint16Array([0x3800, 0x3C00]));
		nearest(gl, gl.TEXTURE_2D);
		var rg = drawFragment(gl, 'uniform sampler2D s; void main(){ o = vec4(texture(s, vec2(.5)).rg, 0, 1); }');
		check('webgl2 RG16F texture', same(rg, [128, 255, 0, 255]), rg);

		var single = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, single);
		// The second pixel, from srcOffset
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([1, .25]), 1);
		nearest(gl, gl.TEXTURE_2D);
		var red = drawFragment(gl, 'uniform sampler2D s; void main(){ o = vec4(texture(s, vec2(.5)).r, 0, 0, 1); }');
		check('webgl2 R32F texture from srcOffset', same(red, [64, 0, 0, 255]), red);

		var integer = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, integer);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, 1, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, new Uint32Array([3000000000]));
		nearest(gl, gl.TEXTURE_2D);
		var unsigned = drawFragment(gl, 'uniform highp usampler2D s; void main(){ o = vec4(texelFetch(s, ivec2(0), 0).r == 3000000000u, 0, 0, 1); }');
		check('webgl2 R32UI texture', same(unsigned, [255, 0, 0, 255]), unsigned);
		gl.bindTexture(gl.TEXTURE_2D, null);
	});

	test('webgl2 textures from a canvas', function() {
		var source = document.createElement('canvas');
		source.width = 3;
		source.height = 1;
		var c = source.getContext('2d');
		c.fillStyle = '#ff0000'; c.fillRect(0, 0, 1, 1);
		c.fillStyle = '#00ff00'; c.fillRect(1, 0, 1, 1);
		c.fillStyle = '#0000ff'; c.fillRect(2, 0, 1, 1);

		// three.js: immutable storage, then the image into it
		var stored = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, stored);
		gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 3, 1);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
		nearest(gl, gl.TEXTURE_2D);
		var green = drawFragment(gl, 'uniform sampler2D s; void main(){ o = texelFetch(s, ivec2(1, 0), 0); }');
		check('webgl2 texStorage2D, then texSubImage2D from a canvas', same(green, [0, 255, 0, 255]), green);

		// 9 bytes a row: UNPACK_ALIGNMENT 4 must not apply to the image
		var rgb = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, rgb);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, source);
		nearest(gl, gl.TEXTURE_2D);
		var blue = drawFragment(gl, 'uniform sampler2D s; void main(){ o = texelFetch(s, ivec2(2, 0), 0); }');
		check('webgl2 RGB8 texture from a canvas', same(blue, [0, 0, 255, 255]), blue);

		// sRGB: 128 is about 55 in linear
		c.fillStyle = '#808080'; c.fillRect(0, 0, 3, 1);
		var srgb = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, srgb);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
		nearest(gl, gl.TEXTURE_2D);
		var linear = drawFragment(gl, 'uniform sampler2D s; void main(){ o = texture(s, vec2(.5)); }');
		check('webgl2 SRGB8_ALPHA8 texture', same(linear, [55, 55, 55, 255], 3), linear);
		gl.bindTexture(gl.TEXTURE_2D, null);
	});

	test('webgl2 sampler', function() {
		var texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
			new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]));
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		var shader = 'uniform sampler2D s; void main(){ o = texture(s, vec2(.4, .5)); }';
		var blended = drawFragment(gl, shader);
		check('webgl2 texture filters linearly', blended[0] > 150 && blended[0] < 210 && blended[2] > 50, blended);

		var sampler = gl.createSampler();
		gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.samplerParameterf(sampler, gl.TEXTURE_MAX_LOD, 4);
		gl.bindSampler(0, sampler);
		check('webgl2 sampler binding', gl.getParameter(gl.SAMPLER_BINDING) === sampler && gl.isSampler(sampler));
		check('webgl2 getSamplerParameter', gl.getSamplerParameter(sampler, gl.TEXTURE_MAG_FILTER) === gl.NEAREST &&
			gl.getSamplerParameter(sampler, gl.TEXTURE_MAX_LOD) === 4);
		var sampled = drawFragment(gl, shader);
		check('webgl2 sampler overrides the texture filter', same(sampled, [255, 0, 0, 255]), sampled);
		gl.bindSampler(0, null);
		check('webgl2 unbinds the sampler', gl.getParameter(gl.SAMPLER_BINDING) === null);
		gl.deleteSampler(sampler);
		check('webgl2 deletes the sampler', !gl.isSampler(sampler));

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
		check('webgl2 texture compare mode', gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE) === gl.COMPARE_REF_TO_TEXTURE);
		gl.bindTexture(gl.TEXTURE_2D, null);
	});
}

// A framebuffer with a new texture at each color attachment
function textureFramebuffer( gl, internalformat, count, size ) {
	var framebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	var textures = [];
	for( var i = 0; i < count; i++ ) {
		var texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texStorage2D(gl.TEXTURE_2D, 1, internalformat, size, size);
		nearest(gl, gl.TEXTURE_2D);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texture, 0);
		textures.push(texture);
	}
	gl.bindTexture(gl.TEXTURE_2D, null);
	return {framebuffer: framebuffer, textures: textures};
}

function readColor( gl, attachment ) {
	gl.readBuffer(attachment);
	var pixel = new Uint8Array(4);
	gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
	return rgba(pixel);
}

function webgl2FramebufferTests() {
	var canvas = document.createElement('canvas');
	canvas.width = canvas.height = 8;
	var gl = canvas.getContext('webgl2');
	if( !gl ) { return skip('webgl2 framebuffers', 'getContext("webgl2") returned null'); }
	console.log('webgl2 extensions: ' + gl.getSupportedExtensions().join(' '));

	function test( name, fn ) {
		try { fn(); }
		catch( e ) { check(name, false, e.message); }
	}

	test('webgl2 typed array parameters', function() {
		var viewport = gl.getParameter(gl.VIEWPORT);
		check('webgl2 VIEWPORT has 4 values', viewport.length === 4 && viewport[2] === 8, viewport.length + ': ' + Array.from(viewport));
	});

	test('webgl2 float render targets', function() {
		if( !gl.getExtension('EXT_color_buffer_float') ) {
			return skip('webgl2 EXT_color_buffer_float', 'not offered');
		}
		var target = textureFramebuffer(gl, gl.RGBA32F, 1, 4);
		var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		check('webgl2 RGBA32F framebuffer complete', status === gl.FRAMEBUFFER_COMPLETE, '0x' + status.toString(16) + ' error 0x' + gl.getError().toString(16));
		gl.viewport(0, 0, 4, 4);
		drawFragment(gl, 'void main(){ o = vec4(2.5, -1, .25, 1); }');
		var pixel = new Float32Array(4);
		gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.FLOAT, pixel);
		check('webgl2 RGBA32F keeps values outside 0-1', equal(Array.from(pixel), [2.5, -1, .25, 1]), Array.from(pixel));
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.deleteFramebuffer(target.framebuffer);
		gl.deleteTexture(target.textures[0]);
	});

	test('webgl2 multiple render targets', function() {
		var target = textureFramebuffer(gl, gl.RGBA8, 2, 4);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
		check('webgl2 MRT framebuffer complete', gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE);
		gl.viewport(0, 0, 4, 4);
		drawFragment(gl, 'layout(location=1) out vec4 o1; void main(){ o = vec4(1, 0, 0, 1); o1 = vec4(0, 1, 0, 1); }');
		var first = readColor(gl, gl.COLOR_ATTACHMENT0);
		var second = readColor(gl, gl.COLOR_ATTACHMENT1);
		check('webgl2 drawBuffers writes each target', same(first, [255, 0, 0, 255]) && same(second, [0, 255, 0, 255]),
			first + ' / ' + second);

		gl.clearBufferfv(gl.COLOR, 1, [0, 0, 1, 1]);
		var cleared = readColor(gl, gl.COLOR_ATTACHMENT1);
		check('webgl2 clearBufferfv', same(cleared, [0, 0, 255, 255]) && same(readColor(gl, gl.COLOR_ATTACHMENT0), [255, 0, 0, 255]), cleared);
		gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.COLOR_ATTACHMENT1]);
		check('webgl2 invalidateFramebuffer', gl.getError() === gl.NO_ERROR);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.drawBuffers([gl.BACK]);
		gl.readBuffer(gl.BACK);
		check('webgl2 drawBuffers BACK on the canvas', gl.getError() === gl.NO_ERROR);
		gl.viewport(0, 0, 8, 8);
	});

	test('webgl2 integer render target', function() {
		var target = textureFramebuffer(gl, gl.R32UI, 1, 4);
		gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([4000000000, 0, 0, 0]));
		var value = new Uint32Array(4);
		gl.readPixels(1, 1, 1, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, value);
		check('webgl2 clearBufferuiv, readPixels RGBA_INTEGER', value[0] === 4000000000, Array.from(value));
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	});

	test('webgl2 half float render target', function() {
		if( !gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float') ) {
			return skip('webgl2 half float render target', 'no EXT_color_buffer_float');
		}
		var target = textureFramebuffer(gl, gl.RGBA16F, 1, 4);
		var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		gl.viewport(0, 0, 4, 4);
		drawFragment(gl, 'void main(){ o = vec4(2.5, -1, .5, 1); }');
		var value = new Float32Array(4);
		gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.FLOAT, value);
		check('webgl2 RGBA16F render target keeps values outside 0 to 1',
			status === gl.FRAMEBUFFER_COMPLETE && value[0] === 2.5 && value[1] === -1, status + ': ' + Array.from(value));
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, 8, 8);
	});

	test('webgl2 MSAA blit', function() {
		var samples = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES);
		check('webgl2 getInternalformatParameter SAMPLES', samples instanceof Int32Array && samples.length > 0 && samples[0] > 1,
			samples && Array.from(samples));
		var msaa = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
		var color = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, color);
		gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA8, 4, 4);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
		var depth = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
		gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.DEPTH24_STENCIL8, 4, 4);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depth);
		check('webgl2 multisample framebuffer complete', gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE);
		gl.clearColor(1, 0, 1, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		var resolved = textureFramebuffer(gl, gl.RGBA8, 1, 4);
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaa);
		gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolved.framebuffer);
		// The scissor test applies to blits; resolves must not be cut by it
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(0, 0, 4, 4);
		gl.blitFramebuffer(0, 0, 4, 4, 0, 0, 4, 4, gl.COLOR_BUFFER_BIT, gl.NEAREST);
		gl.disable(gl.SCISSOR_TEST);
		check('webgl2 READ_FRAMEBUFFER_BINDING', gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === msaa);
		gl.bindFramebuffer(gl.FRAMEBUFFER, resolved.framebuffer);
		var pixel = readColor(gl, gl.COLOR_ATTACHMENT0);
		check('webgl2 blitFramebuffer resolves MSAA', same(pixel, [255, 0, 255, 255]), pixel);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.clearColor(0, 0, 0, 1);
	});

	test('webgl2 render to a texture layer', function() {
		var array = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, array);
		gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 4, 4, 2);
		nearest(gl, gl.TEXTURE_2D_ARRAY);
		var framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, array, 0, 1);
		gl.clearColor(0, 1, 1, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.clearColor(0, 0, 0, 1);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		var layer = drawFragment(gl, 'uniform sampler2DArray s; void main(){ o = texture(s, vec3(.5, .5, 1)); }');
		check('webgl2 framebufferTextureLayer', same(layer, [0, 255, 255, 255]), layer);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
	});

	test('webgl2 framebufferTexture2D keeps the texture binding', function() {
		var bound = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, bound);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([1, 2, 3, 4]));
		var attached = gl.createTexture();
		var framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, attached, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		check('webgl2 framebufferTexture2D keeps the texture binding', gl.getParameter(gl.TEXTURE_BINDING_2D) === bound);
		gl.bindTexture(gl.TEXTURE_2D, null);
	});

	test('webgl2 readPixels on an antialiased canvas', function() {
		var aaCanvas = document.createElement('canvas');
		aaCanvas.width = aaCanvas.height = 8;
		var aa = aaCanvas.getContext('webgl2', {antialias: true});
		aa.clearColor(0, 1, 0, 1);
		aa.clear(aa.COLOR_BUFFER_BIT);
		var pixel = new Uint8Array(4);
		aa.readPixels(4, 4, 1, 1, aa.RGBA, aa.UNSIGNED_BYTE, pixel);
		check('webgl2 readPixels on an antialiased canvas', same(rgba(pixel), [0, 255, 0, 255]) && aa.getError() === aa.NO_ERROR,
			rgba(pixel) + ' ' + aa.getContextAttributes().antialias);
	});
}

var VS300 = '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0, 1); }';
var FS300 = '#version 300 es\nprecision highp float; layout(location=0) out vec4 o;';

function fullscreenTriangle( gl, program ) {
	var buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	var at = gl.getAttribLocation(program, 'p');
	gl.enableVertexAttribArray(at);
	gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
	return function() {
		gl.disableVertexAttribArray(at);
		gl.deleteBuffer(buffer);
	};
}

function centerPixel( gl ) {
	var pixel = new Uint8Array(4);
	gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
	return rgba(pixel);
}

function webgl2UniformBufferTests() {
	var canvas = document.createElement('canvas');
	canvas.width = canvas.height = 8;
	var gl = canvas.getContext('webgl2');
	if( !gl ) { return skip('webgl2 uniforms', 'getContext("webgl2") returned null'); }

	function test( name, fn ) {
		try { fn(); }
		catch( e ) { check(name, false, e.message); }
	}

	test('webgl2 uniform types', function() {
		var program = compileProgram(gl, VS300, FS300 +
			'uniform uint u; uniform uvec2 u2; uniform ivec3 i3; uniform mat2x3 m; uniform vec4 v[2];' +
			'uniform sampler2D s;' +
			'void main(){ o = vec4(float(u) / 255., float(u2.y) / 255., float(i3.z) / 255., 1)' +
			' + vec4(m[1][2] + v[1].x) * 0. + texture(s, vec2(0)) * 0.; }');
		gl.useProgram(program);
		var loc = function( name ) { return gl.getUniformLocation(program, name); };
		gl.uniform1ui(loc('u'), 51);
		gl.uniform2uiv(loc('u2'), new Uint32Array([9, 9, 1, 102]), 2);
		gl.uniform3iv(loc('i3'), [1, 2, 153]);
		gl.uniformMatrix2x3fv(loc('m'), false, [1, 2, 3, 4, 5, 6]);
		gl.uniform4fv(loc('v'), new Float32Array([0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]), 4, 8);
		gl.uniform1i(loc('s'), 3);
		check('webgl2 uniform1ui and uniform2uiv srcOffset', gl.getUniform(program, loc('u')) === 51 &&
			equal(gl.getUniform(program, loc('u2')), [1, 102]),
			gl.getUniform(program, loc('u')) + ' ' + gl.getUniform(program, loc('u2')));
		var i3 = gl.getUniform(program, loc('i3'));
		check('webgl2 getUniform ivec3 is an Int32Array', i3 instanceof Int32Array && equal(i3, [1, 2, 153]), i3);
		var m = gl.getUniform(program, loc('m'));
		check('webgl2 uniformMatrix2x3fv', m && m.length === 6 && m[5] === 6, m && Array.from(m));
		var v1 = gl.getUniform(program, loc('v[1]'));
		check('webgl2 uniform4fv srcOffset and srcLength', v1 && equal(v1, [5, 6, 7, 8]), v1 && Array.from(v1));
		check('webgl2 getUniform sampler', gl.getUniform(program, loc('s')) === 3, gl.getUniform(program, loc('s')));
		gl.uniform1i(loc('s'), 0);
		var done = fullscreenTriangle(gl, program);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		var pixel = centerPixel(gl);
		check('webgl2 uint and int uniforms in a shader', same(pixel, [51, 102, 153, 255]), pixel);
		done();
		gl.deleteProgram(program);
	});

	test('webgl2 integer attributes', function() {
		var program = compileProgram(gl,
			'#version 300 es\nin ivec2 p; in uvec4 c; flat out uvec4 vc;' +
			'void main(){ vc = c; gl_Position = vec4(vec2(p), 0, 1); }',
			FS300 + 'flat in uvec4 vc; void main(){ o = vec4(vc) / 255.; }');
		gl.useProgram(program);
		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Int32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		var p = gl.getAttribLocation(program, 'p');
		var c = gl.getAttribLocation(program, 'c');
		gl.enableVertexAttribArray(p);
		gl.vertexAttribIPointer(p, 2, gl.INT, 0, 0);
		gl.vertexAttribI4ui(c, 255, 0, 255, 255);
		check('webgl2 VERTEX_ATTRIB_ARRAY_INTEGER', gl.getVertexAttrib(p, gl.VERTEX_ATTRIB_ARRAY_INTEGER) === true &&
			gl.getVertexAttrib(p, gl.VERTEX_ATTRIB_ARRAY_ENABLED) === true);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		var pixel = centerPixel(gl);
		check('webgl2 vertexAttribIPointer and vertexAttribI4ui', same(pixel, [255, 0, 255, 255]), pixel);
		gl.disableVertexAttribArray(p);
		gl.deleteBuffer(buffer);
		gl.deleteProgram(program);

		gl.vertexAttrib4f(5, 0.5, 1, 2, 3);
		var current = gl.getVertexAttrib(5, gl.CURRENT_VERTEX_ATTRIB);
		check('webgl2 CURRENT_VERTEX_ATTRIB', current instanceof Float32Array && equal(current, [0.5, 1, 2, 3]),
			current && Array.from(current));
	});

	test('webgl2 uniform blocks', function() {
		var program = compileProgram(gl, VS300, FS300 +
			'uniform Colors { vec4 tint; vec4 color; }; void main(){ o = color + tint * 0.; }');
		gl.useProgram(program);
		var block = gl.getUniformBlockIndex(program, 'Colors');
		gl.uniformBlockBinding(program, block, 1);
		var ubo = gl.createBuffer();
		gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
		gl.bufferData(gl.UNIFORM_BUFFER, new Float32Array([0, 0, 0, 0, 0, 1, 0, 1]), gl.DYNAMIC_DRAW);
		gl.bindBufferRange(gl.UNIFORM_BUFFER, 1, ubo, 0, 32);
		var done = fullscreenTriangle(gl, program);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		var pixel = centerPixel(gl);
		check('webgl2 uniform buffer', same(pixel, [0, 255, 0, 255]), pixel);
		done();

		check('webgl2 getUniformBlockIndex', block === 0 && gl.getUniformBlockIndex(program, 'Nope') === gl.INVALID_INDEX, block);
		check('webgl2 getActiveUniformBlockName', gl.getActiveUniformBlockName(program, block) === 'Colors');
		check('webgl2 UNIFORM_BLOCK_DATA_SIZE', gl.getActiveUniformBlockParameter(program, block, gl.UNIFORM_BLOCK_DATA_SIZE) >= 32);
		check('webgl2 UNIFORM_BLOCK_BINDING', gl.getActiveUniformBlockParameter(program, block, gl.UNIFORM_BLOCK_BINDING) === 1);
		var members = gl.getActiveUniformBlockParameter(program, block, gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES);
		check('webgl2 UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES', members instanceof Uint32Array && members.length === 2, members);
		check('webgl2 UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER',
			gl.getActiveUniformBlockParameter(program, block, gl.UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER) === true);
		var indices = gl.getUniformIndices(program, ['color', 'nope']);
		check('webgl2 getUniformIndices', indices.length === 2 && indices[1] === gl.INVALID_INDEX, indices);
		var offsets = gl.getActiveUniforms(program, [indices[0]], gl.UNIFORM_OFFSET);
		check('webgl2 getActiveUniforms UNIFORM_OFFSET', offsets.length === 1 && offsets[0] === 16, offsets);
		var rowMajor = gl.getActiveUniforms(program, [indices[0]], gl.UNIFORM_IS_ROW_MAJOR);
		check('webgl2 getActiveUniforms UNIFORM_IS_ROW_MAJOR', rowMajor[0] === false, rowMajor);
		check('webgl2 getIndexedParameter', gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, 1) === ubo &&
			gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, 1) === 32);
		check('webgl2 UNIFORM_BUFFER_OFFSET_ALIGNMENT', gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT) > 0);
		gl.deleteBuffer(ubo);
		gl.deleteProgram(program);
	});

	test('webgl2 buffers', function() {
		var a = gl.createBuffer();
		gl.bindBuffer(gl.COPY_READ_BUFFER, a);
		gl.bufferData(gl.COPY_READ_BUFFER, new Float32Array([9, 1, 2, 3, 4, 9]), gl.STATIC_DRAW, 1, 4);
		check('webgl2 bufferData srcOffset and length', gl.getBufferParameter(gl.COPY_READ_BUFFER, gl.BUFFER_SIZE) === 16);
		gl.bufferSubData(gl.COPY_READ_BUFFER, 4, new Float32Array([7, 8, 9]), 1, 1);
		var b = gl.createBuffer();
		gl.bindBuffer(gl.COPY_WRITE_BUFFER, b);
		gl.bufferData(gl.COPY_WRITE_BUFFER, 16, gl.STATIC_READ);
		gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, 0, 0, 16);
		var out = new Float32Array(6);
		gl.getBufferSubData(gl.COPY_WRITE_BUFFER, 0, out, 1, 4);
		check('webgl2 bufferSubData, copyBufferSubData, getBufferSubData', equal(out, [0, 1, 8, 3, 4, 0]), Array.from(out));
		check('webgl2 COPY_READ_BUFFER_BINDING', gl.getParameter(gl.COPY_READ_BUFFER_BINDING) === a);
		gl.deleteBuffer(a);
		gl.deleteBuffer(b);

		var program = compileProgram(gl, VS300, FS300 + 'void main(){ o = vec4(1, 1, 0, 1); }');
		gl.useProgram(program);
		var done = fullscreenTriangle(gl, program);
		var elements = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2]), gl.STATIC_DRAW);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawRangeElements(gl.TRIANGLES, 0, 2, 3, gl.UNSIGNED_SHORT, 0);
		var pixel = centerPixel(gl);
		check('webgl2 drawRangeElements', same(pixel, [255, 255, 0, 255]), pixel);
		gl.deleteBuffer(elements);
		done();
		gl.deleteProgram(program);
	});

	test('webgl2 queries and sync', function() {
		var program = compileProgram(gl, VS300, FS300 + 'void main(){ o = vec4(1); }');
		gl.useProgram(program);
		var done = fullscreenTriangle(gl, program);
		var query = gl.createQuery();
		gl.beginQuery(gl.ANY_SAMPLES_PASSED, query);
		check('webgl2 getQuery CURRENT_QUERY', gl.getQuery(gl.ANY_SAMPLES_PASSED, gl.CURRENT_QUERY) === query);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.endQuery(gl.ANY_SAMPLES_PASSED);
		check('webgl2 isQuery', gl.isQuery(query) === true);
		var sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
		gl.finish();
		var waited = gl.clientWaitSync(sync, gl.SYNC_FLUSH_COMMANDS_BIT, 0);
		check('webgl2 fenceSync and clientWaitSync', gl.isSync(sync) &&
			(waited === gl.ALREADY_SIGNALED || waited === gl.CONDITION_SATISFIED) &&
			gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED, waited);
		gl.deleteSync(sync);
		check('webgl2 deleteSync', gl.isSync(sync) === false);
		check('webgl2 query result', gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) === true &&
			gl.getQueryParameter(query, gl.QUERY_RESULT) === 1, gl.getQueryParameter(query, gl.QUERY_RESULT));
		gl.deleteQuery(query);
		check('webgl2 deleteQuery', gl.isQuery(query) === false);
		done();
		gl.deleteProgram(program);
	});

	test('webgl2 transform feedback', function() {
		var program = compileProgram(gl,
			'#version 300 es\nout float doubled; void main(){ doubled = float(gl_VertexID) * 2.; gl_Position = vec4(0); gl_PointSize = 1.; }',
			FS300 + 'void main(){ o = vec4(1); }',
			function( program ) { gl.transformFeedbackVaryings(program, ['doubled'], gl.SEPARATE_ATTRIBS); });
		var varying = gl.getTransformFeedbackVarying(program, 0);
		check('webgl2 getTransformFeedbackVarying', varying && varying.name === 'doubled' && varying.type === gl.FLOAT,
			varying && varying.name);
		gl.useProgram(program);
		var output = gl.createBuffer();
		gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, output);
		gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 12, gl.STREAM_READ);
		gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
		var feedback = gl.createTransformFeedback();
		gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
		gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output);
		check('webgl2 TRANSFORM_FEEDBACK_BINDING', gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING) === feedback);
		gl.enable(gl.RASTERIZER_DISCARD);
		gl.beginTransformFeedback(gl.POINTS);
		check('webgl2 TRANSFORM_FEEDBACK_ACTIVE', gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE) === true);
		gl.drawArrays(gl.POINTS, 0, 3);
		gl.endTransformFeedback();
		gl.disable(gl.RASTERIZER_DISCARD);
		gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
		gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
		gl.bindBuffer(gl.COPY_READ_BUFFER, output);
		var values = new Float32Array(3);
		gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, values);
		check('webgl2 transform feedback writes the varyings', equal(values, [0, 2, 4]), Array.from(values));
		gl.deleteTransformFeedback(feedback);
		check('webgl2 deleteTransformFeedback', gl.isTransformFeedback(feedback) === false);
		gl.deleteBuffer(output);
		gl.deleteProgram(program);
	});

	test('webgl2 drawArraysInstanced', function() {
		var program = compileProgram(gl, VS300, FS300 + 'void main(){ o = vec4(0, 0, 1, 1); }');
		gl.useProgram(program);
		var done = fullscreenTriangle(gl, program);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, 2);
		var pixel = centerPixel(gl);
		check('webgl2 drawArraysInstanced', same(pixel, [0, 0, 255, 255]), pixel);
		done();
		gl.deleteProgram(program);
	});
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

// Last, as LittleJS takes over the screen. just test-sim copies LittleJS and
// the shim in; without them this is skipped.
async function littlejsTests() {
	if( (await fetch('littlejs.js')).status !== 200 ) {
		return skip('littlejs', 'littlejs.js is not in the app');
	}
	ejecta.include('littlejs.js');
	ejecta.include('littlejs-ejecta.js');
	ejecta.include('littlejs-test.js');
	await new Promise(function( resolve ) {
		check.done = resolve;
		littlejsTest(check);
	});
}

async function run() {
	console.log('Ejecta device tests: ' + navigator.userAgent);
	ejecta.include('canvas2d-test.js');
	var steps = [canvasTests, canvas2dTests, screenCanvasTests, webglTests, webgl2Tests, webgl2TextureTests, webgl2FramebufferTests, webgl2UniformBufferTests, audioTests, fetchTests, littlejsTests];
	for( var i = 0; i < steps.length; i++ ) {
		try { await steps[i](); }
		catch( e ) { check(steps[i].name, false, e + ' ' + e.stack); }
	}
	console.log('DONE ' + results.pass + ' passed, ' + results.fail + ' failed');
}

setTimeout(run, 500);
