// Canvas 2D renderer tests: everything the 2D context draws with, checked by
// reading pixels back. They pin down what the renderer must do, whichever
// graphics API is underneath. Loaded by index.js; scoped so its helpers
// do not clash with globals LittleJS declares later (RED, GREEN, ...).

(function() {

function canvas2d( w, h, options ) {
	var canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h || w;
	return canvas.getContext('2d', options);
}
function pixel( ctx, x, y ) { return rgba(ctx.getImageData(x, y, 1, 1).data); }

function loadImage( src ) {
	return new Promise(function( resolve, reject ) {
		var img = new Image();
		img.onload = function() { resolve(img); };
		img.onerror = function() { reject(new Error('could not load ' + src)); };
		img.src = src;
	});
}

var RED = [255, 0, 0, 255], GREEN = [0, 255, 0, 255], BLUE = [0, 0, 255, 255],
	WHITE = [255, 255, 255, 255], CLEAR = [0, 0, 0, 0];

window.canvas2dTests = async function canvas2dTests() {
	var ctx, a, b, c, d;

	// Paths: two overlapping squares drawn the same way round. Non-zero fills
	// the overlap, even-odd leaves it empty.
	ctx = canvas2d(32);
	function squares() {
		ctx.beginPath();
		ctx.rect(2, 2, 18, 18);
		ctx.rect(12, 12, 18, 18);
	}
	ctx.fillStyle = '#00ff00';
	squares();
	ctx.fill();
	a = pixel(ctx, 16, 16);
	ctx.clearRect(0, 0, 32, 32);
	squares();
	ctx.fill('evenodd');
	b = pixel(ctx, 16, 16); c = pixel(ctx, 5, 5);
	check('2d fill nonzero', same(a, GREEN), a);
	check('2d fill evenodd', same(b, CLEAR) && same(c, GREEN), b + ' / ' + c);

	// A concave shape: an L. The notch must stay empty.
	ctx.clearRect(0, 0, 32, 32);
	ctx.beginPath();
	ctx.moveTo(2, 2); ctx.lineTo(10, 2); ctx.lineTo(10, 22); ctx.lineTo(30, 22);
	ctx.lineTo(30, 30); ctx.lineTo(2, 30); ctx.closePath();
	ctx.fill();
	a = pixel(ctx, 6, 10); b = pixel(ctx, 20, 10); c = pixel(ctx, 20, 26);
	check('2d concave fill', same(a, GREEN) && same(b, CLEAR) && same(c, GREEN), a + ' / ' + b + ' / ' + c);

	// Clipping, nested clips intersect, restore() lifts them
	ctx.clearRect(0, 0, 32, 32);
	ctx.save();
	ctx.beginPath(); ctx.rect(0, 0, 16, 32); ctx.clip();
	ctx.save();
	ctx.beginPath(); ctx.rect(0, 0, 32, 16); ctx.clip();
	ctx.fillStyle = '#ff0000';
	ctx.fillRect(0, 0, 32, 32);
	ctx.restore();
	ctx.fillStyle = '#0000ff';
	ctx.fillRect(0, 24, 32, 8);
	ctx.restore();
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(28, 0, 4, 4);
	a = pixel(ctx, 8, 8); b = pixel(ctx, 24, 8); c = pixel(ctx, 8, 20);
	d = [pixel(ctx, 8, 28), pixel(ctx, 24, 28), pixel(ctx, 30, 2)];
	check('2d nested clip', same(a, RED) && same(b, CLEAR) && same(c, CLEAR), a + ' / ' + b + ' / ' + c);
	check('2d clip restore', same(d[0], BLUE) && same(d[1], CLEAR) && same(d[2], WHITE), d.join(' / '));

	// A clip that is a path with curves
	ctx.clearRect(0, 0, 32, 32);
	ctx.save();
	ctx.beginPath(); ctx.arc(16, 16, 10, 0, Math.PI * 2); ctx.clip();
	ctx.fillStyle = '#ff0000';
	ctx.fillRect(0, 0, 32, 32);
	ctx.restore();
	a = pixel(ctx, 16, 16); b = pixel(ctx, 2, 2);
	check('2d circular clip', same(a, RED) && same(b, CLEAR), a + ' / ' + b);

	// globalAlpha and premultiplied alpha coming back unpremultiplied
	ctx.clearRect(0, 0, 32, 32);
	ctx.globalAlpha = 0.5;
	ctx.fillStyle = '#ff0000';
	ctx.fillRect(0, 0, 32, 32);
	ctx.globalAlpha = 1;
	a = pixel(ctx, 16, 16);
	check('2d globalAlpha', same(a, [255, 0, 0, 128], 3), a);

	// Composite operations
	ctx.globalCompositeOperation = 'destination-out';
	ctx.fillStyle = '#000000';
	ctx.fillRect(0, 0, 16, 32);
	ctx.globalCompositeOperation = 'source-over';
	a = pixel(ctx, 8, 8); b = pixel(ctx, 24, 8);
	check('2d destination-out', same(a, CLEAR) && same(b, [255, 0, 0, 128], 3), a + ' / ' + b);
	ctx.fillStyle = '#0000ff';
	ctx.fillRect(0, 0, 32, 32);
	ctx.globalCompositeOperation = 'lighter';
	ctx.fillStyle = '#ff0000';
	ctx.fillRect(0, 0, 32, 32);
	ctx.globalCompositeOperation = 'source-over';
	a = pixel(ctx, 8, 8);
	check('2d lighter', same(a, [255, 0, 255, 255]), a);

	// clearRect leaves a hole
	ctx.clearRect(8, 8, 16, 16);
	a = pixel(ctx, 16, 16); b = pixel(ctx, 2, 2);
	check('2d clearRect', same(a, CLEAR) && b[3] === 255, a + ' / ' + b);

	// Transforms: a rotated square covers the middle but not the corners
	ctx.clearRect(0, 0, 32, 32);
	ctx.save();
	ctx.translate(16, 16);
	ctx.rotate(Math.PI / 4);
	ctx.scale(2, 2);
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(-5, -5, 10, 10);
	ctx.restore();
	a = pixel(ctx, 16, 16); b = pixel(ctx, 16, 4); c = pixel(ctx, 2, 2);
	check('2d transforms', same(a, WHITE) && same(b, WHITE) && same(c, CLEAR), a + ' / ' + b + ' / ' + c);

	// Linear gradient, left to right
	ctx.clearRect(0, 0, 32, 32);
	var linear = ctx.createLinearGradient(0, 0, 32, 0);
	linear.addColorStop(0, '#ff0000');
	linear.addColorStop(1, '#0000ff');
	ctx.fillStyle = linear;
	ctx.fillRect(0, 0, 32, 32);
	a = pixel(ctx, 1, 16); b = pixel(ctx, 30, 16); c = pixel(ctx, 16, 16);
	check('2d linear gradient', a[0] > 220 && a[2] < 35 && b[2] > 220 && b[0] < 35 && near(c[0], c[2], 40) && c[3] === 255,
		a + ' / ' + c + ' / ' + b);

	// Radial gradient, white middle to black edge
	var radial = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
	radial.addColorStop(0, '#ffffff');
	radial.addColorStop(1, '#000000');
	ctx.fillStyle = radial;
	ctx.fillRect(0, 0, 32, 32);
	a = pixel(ctx, 16, 16); b = pixel(ctx, 16, 1); c = pixel(ctx, 16, 8);
	check('2d radial gradient', a[0] > 220 && b[0] < 35 && c[0] > 90 && c[0] < 170, a + ' / ' + c + ' / ' + b);

	// A gradient filling a path and stroking a line
	ctx.clearRect(0, 0, 32, 32);
	ctx.beginPath(); ctx.arc(16, 16, 12, 0, Math.PI * 2);
	ctx.fillStyle = linear;
	ctx.fill();
	a = pixel(ctx, 8, 16); b = pixel(ctx, 1, 1);
	check('2d gradient path fill', a[0] > 150 && a[2] < 110 && same(b, CLEAR), a + ' / ' + b);
	ctx.clearRect(0, 0, 32, 32);
	ctx.strokeStyle = linear;
	ctx.lineWidth = 6;
	ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(32, 16); ctx.stroke();
	a = pixel(ctx, 2, 16); b = pixel(ctx, 29, 16); c = pixel(ctx, 16, 4);
	check('2d gradient stroke', a[0] > 200 && b[2] > 200 && same(c, CLEAR), a + ' / ' + b + ' / ' + c);

	// Pattern from a 2x2 checkerboard canvas, repeated
	var tile = canvas2d(2);
	tile.fillStyle = '#ffffff'; tile.fillRect(0, 0, 2, 2);
	tile.fillStyle = '#000000'; tile.fillRect(0, 0, 1, 1); tile.fillRect(1, 1, 1, 1);
	ctx.clearRect(0, 0, 32, 32);
	ctx.imageSmoothingEnabled = false;
	ctx.fillStyle = ctx.createPattern(tile.canvas, 'repeat');
	ctx.fillRect(0, 0, 32, 32);
	ctx.imageSmoothingEnabled = true;
	a = pixel(ctx, 10, 10); b = pixel(ctx, 11, 10); c = pixel(ctx, 20, 21);
	check('2d pattern', a[0] < 30 && b[0] > 225 && c[0] > 225 && a[3] === 255, a + ' / ' + b + ' / ' + c);

	// Transparent strokes that cross themselves blend once, not twice
	ctx.clearRect(0, 0, 32, 32);
	ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.moveTo(2, 16); ctx.lineTo(30, 16); ctx.lineTo(30, 4); ctx.lineTo(16, 4); ctx.lineTo(16, 30);
	ctx.stroke();
	a = pixel(ctx, 16, 16); b = pixel(ctx, 6, 16);
	check('2d transparent stroke overlap', near(a[3], b[3], 4) && near(b[3], 128, 4), a + ' / ' + b);
	// ...and again, so the stencil bits it cycles through are reused
	for( var i = 0; i < 9; i++ ) {
		ctx.clearRect(0, 0, 32, 32);
		ctx.stroke();
	}
	a = pixel(ctx, 16, 16); b = pixel(ctx, 6, 16);
	check('2d transparent strokes repeated', near(a[3], b[3], 4) && near(b[3], 128, 4), a + ' / ' + b);

	// strokeRect
	ctx.clearRect(0, 0, 32, 32);
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 2;
	ctx.strokeRect(4, 4, 24, 24);
	a = pixel(ctx, 4, 16); b = pixel(ctx, 16, 16);
	check('2d strokeRect', same(a, WHITE) && same(b, CLEAR), a + ' / ' + b);

	// putImageData and getImageData round trip unpremultiplied values
	var id = ctx.createImageData(4, 4);
	for( i = 0; i < 64; i += 4 ) { id.data[i] = 200; id.data[i+1] = 100; id.data[i+2] = 50; id.data[i+3] = 128; }
	ctx.putImageData(id, 10, 10);
	a = pixel(ctx, 11, 11);
	check('2d putImageData round trip', same(a, [200, 100, 50, 128], 4), a);
	var got = ctx.getImageData(10, 10, 4, 4);
	check('2d getImageData size', got.width === 4 && got.height === 4 && got.data.length === 64);

	// An image: quadrants red, green, blue, white, scaled up without smoothing
	try {
		var img = await loadImage('quad.png');
		check('2d image loads', img.width === 4 && img.height === 4, img.width + 'x' + img.height);
		ctx.clearRect(0, 0, 32, 32);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(img, 0, 0, 32, 32);
		ctx.imageSmoothingEnabled = true;
		a = [pixel(ctx, 4, 4), pixel(ctx, 28, 4), pixel(ctx, 4, 28), pixel(ctx, 28, 28)];
		check('2d drawImage', same(a[0], RED) && same(a[1], GREEN) && same(a[2], BLUE) && same(a[3], WHITE), a.join(' / '));
		ctx.clearRect(0, 0, 32, 32);
		ctx.drawImage(img, 2, 0, 2, 2, 0, 0, 8, 8);
		a = pixel(ctx, 4, 4);
		check('2d drawImage source rect', same(a, GREEN), a);
	}
	catch( e ) { check('2d image', false, e.message); }

	// One canvas drawn into another, and into itself
	var src = canvas2d(8);
	src.fillStyle = '#ff0000'; src.fillRect(0, 0, 8, 4);
	src.fillStyle = '#00ff00'; src.fillRect(0, 4, 8, 4);
	ctx.clearRect(0, 0, 32, 32);
	ctx.drawImage(src.canvas, 0, 0);
	a = pixel(ctx, 4, 1); b = pixel(ctx, 4, 6);
	check('2d canvas drawn into canvas', same(a, RED) && same(b, GREEN), a + ' / ' + b);
	ctx.drawImage(ctx.canvas, 0, 0, 8, 8, 16, 16, 8, 8);
	a = pixel(ctx, 20, 17); b = pixel(ctx, 20, 22);
	check('2d canvas drawn into itself', same(a, RED) && same(b, GREEN), a + ' / ' + b);

	// Text
	ctx.clearRect(0, 0, 32, 32);
	ctx.font = '28px Helvetica';
	ctx.fillStyle = '#ffffff';
	ctx.textBaseline = 'top';
	ctx.fillText('W', 2, 2);
	var data = ctx.getImageData(0, 0, 32, 32).data, lit = 0;
	for( i = 3; i < data.length; i += 4 ) { if( data[i] > 128 ) { lit++; } }
	check('2d fillText draws glyphs', lit > 40 && lit < 900, lit + ' pixels');
	check('2d measureText', ctx.measureText('WW').width > ctx.measureText('W').width, ctx.measureText('W').width);

	// Resizing clears the canvas
	ctx.fillRect(0, 0, 32, 32);
	ctx.canvas.width = 32;
	a = pixel(ctx, 16, 16);
	check('2d setting width clears', same(a, CLEAR), a);
	ctx.canvas.width = 48;
	ctx.fillStyle = '#0000ff';
	ctx.fillRect(40, 0, 8, 8);
	a = pixel(ctx, 44, 4);
	check('2d resize', ctx.canvas.width === 48 && same(a, BLUE), a);

	// Antialiased (multisampled) canvas
	var aa = canvas2d(16, 16, {antialias: true});
	aa.fillStyle = '#ff0000';
	aa.fillRect(0, 0, 16, 16);
	aa.fillStyle = '#0000ff';
	aa.beginPath(); aa.arc(8, 8, 5, 0, Math.PI * 2); aa.fill();
	a = pixel(aa, 8, 8); b = pixel(aa, 1, 1);
	check('2d antialias canvas', same(a, BLUE) && same(b, RED), a + ' / ' + b);
	var aaTarget = canvas2d(16);
	aaTarget.drawImage(aa.canvas, 0, 0);
	a = pixel(aaTarget, 8, 8);
	check('2d antialias canvas drawn into canvas', same(a, BLUE), a);

	check('2d toDataURL', src.canvas.toDataURL().indexOf('data:image/png;base64,') === 0);

	// A 2D canvas uploaded into WebGL: the top row lands at t = 0
	var glCanvas = document.createElement('canvas');
	glCanvas.width = glCanvas.height = 8;
	var gl = glCanvas.getContext('webgl');
	try {
		var program = compileProgram(gl,
			'attribute vec2 p; varying vec2 uv; void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0, 1); }',
			'precision mediump float; uniform sampler2D s; varying vec2 uv; void main(){ gl_FragColor = texture2D(s, uv); }');
		gl.useProgram(program);
		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		var at = gl.getAttribLocation(program, 'p');
		gl.enableVertexAttribArray(at);
		gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
		var texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		var px = new Uint8Array(4), px2 = new Uint8Array(4);

		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src.canvas);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.readPixels(4, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
		gl.readPixels(4, 6, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px2);
		check('2d canvas as WebGL texture', same(rgba(px), RED) && same(rgba(px2), GREEN), rgba(px) + ' / ' + rgba(px2));

		// Later drawing into the 2D canvas must not change the uploaded copy
		src.fillStyle = '#0000ff'; src.fillRect(0, 0, 8, 8);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.readPixels(4, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
		check('2d canvas WebGL texture is a copy', same(rgba(px), RED), rgba(px));

		if( img ) {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
			gl.readPixels(6, 6, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px2);
			check('image as WebGL texture', same(rgba(px), RED) && same(rgba(px2), WHITE), rgba(px) + ' / ' + rgba(px2));
		}
	}
	catch( e ) { check('2d canvas as WebGL texture', false, e.message); }
}

// The screen canvas: drawn, presented for a few frames, then read back
window.screenCanvasTests = async function screenCanvasTests() {
	var ctx = window.canvas.getContext('2d');
	var w = window.canvas.width, h = window.canvas.height;
	ctx.fillStyle = '#00ff00';
	ctx.fillRect(0, 0, w, h);
	ctx.fillStyle = '#ff0000';
	ctx.fillRect(0, 0, 10, 10);
	await wait(100);
	var a = pixel(ctx, 5, 5), b = pixel(ctx, w / 2 | 0, h / 2 | 0);
	check('screen canvas draws and keeps its pixels', same(a, RED) && same(b, GREEN), a + ' / ' + b);
	var copy = canvas2d(10);
	copy.drawImage(window.canvas, 0, 0);
	a = pixel(copy, 5, 5);
	check('screen canvas drawn into canvas', same(a, RED), a);
}

})();
