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
		'out vec4 o;' + fragment);
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
	var steps = [canvasTests, canvas2dTests, screenCanvasTests, webglTests, webgl2Tests, webgl2TextureTests, audioTests, fetchTests, littlejsTests];
	for( var i = 0; i < steps.length; i++ ) {
		try { await steps[i](); }
		catch( e ) { check(steps[i].name, false, e + ' ' + e.stack); }
	}
	console.log('DONE ' + results.pass + ' passed, ' + results.fail + ' failed');
}

setTimeout(run, 500);
