// WebGL 2 layer checks for Ejecta.js, run by `just test-js`: the GLSL ES 3.00
// to 1.00 translation, and that WebGL 2 calls reach the right WebGL 1 calls.
// Nothing is drawn here; tools/device-tests draws for real.

function check( name, ok, detail ) {
	console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' -- ' + detail));
}
var translate = window.__ejectaTranslateGLSL;

// LittleJS's sprite shaders
var vertex = '#version 300 es\n' +
	'precision highp float;uniform mat4 m;layout(location=0) in vec2 g;layout(location=1) in vec4 p;' +
	'layout(location=2) in vec4 u;layout(location=3) in vec4 c;layout(location=4) in vec4 a;' +
	'layout(location=5) in float r;out vec2 v,l;out vec4 d,e;' +
	'void main(){vec2 s=(g-.5)*p.zw;gl_Position=m*vec4(p.xy+s*cos(r),1,1);v=u.xy;l=g;d=c;e=a;}';
var fragment = '#version 300 es\n' +
	'precision highp float;uniform sampler2D s;in vec2 v;in vec4 d,e;out vec4 c;' +
	'void main(){vec4 t=texture(s,v);c=t*d+e*round(t.a);}';

var tv = translate(vertex, true);
check('no #version left', !/#version/.test(tv.source), tv.source);
check('vertex inputs become attributes', (tv.source.match(/\battribute\b/g) || []).length === 6 && !/\bin\s/.test(tv.source), tv.source);
check('vertex outputs become varyings', /varying vec2 v,l/.test(tv.source) && /varying vec4 d,e/.test(tv.source), tv.source);
check('layout locations are kept', JSON.stringify(tv.attributes.map(function( a ) { return a.name + a.location; })) ===
	'["g0","p1","u2","c3","a4","r5"]', JSON.stringify(tv.attributes));
check('no layout() left', !/layout/.test(tv.source), tv.source);

var tf = translate(fragment, false);
check('fragment inputs become varyings', /varying vec2 v;/.test(tf.source) && /varying vec4 d,e;/.test(tf.source), tf.source);
check('texture() becomes texture2D()', /texture2D\(s,v\)/.test(tf.source) && !/\btexture\(/.test(tf.source), tf.source);
check('the output is written to gl_FragColor', /void main\(\)\{ejectaMain\(\);gl_FragColor=vec4\(c\);\}/.test(tf.source) &&
	/void ejectaMain\(/.test(tf.source) && /(^|;)vec4 c;/.test(tf.source), tf.source);
check('round() gets a helper after the precision statement', /precision highp float;float round\(float x\)/.test(tf.source), tf.source);

var cube = translate('#version 300 es\nprecision mediump float;uniform samplerCube sky;uniform sampler2D t;in vec3 n;out vec4 o;' +
	'void main(){o=texture(sky,n)+texture(t,n.xy);}', false).source;
check('texture() on a samplerCube becomes textureCube()', /textureCube\(sky,n\)/.test(cube) && /texture2D\(t,n.xy\)/.test(cube), cube);

var params = translate('#version 300 es\nprecision mediump float;in vec2 q;out vec4 o;' +
	'float f(in vec2 a, inout float b){b+=a.x;return b;}\nflat in float k;void main(){float b=0.;o=vec4(f(q,b),k,0,1);}', false).source;
check('in and inout parameters are left alone', /float f\(in vec2 a, inout float b\)/.test(params), params);
check('flat is dropped', /varying float k;/.test(params) && !/flat/.test(params), params);

var noPrecision = translate('#version 300 es\nout vec4 o;void main(){o=vec4(1);}', false).source;
check('a fragment shader gets a default precision', /^precision mediump float;/.test(noPrecision), noPrecision);

var comments = translate('#version 300 es\n// in vec2 nope;\n/* out\nvec4 x; */\nin vec2 g;void main(){}', true).source;
check('comments are removed, lines kept', comments.split('\n').length === 5 && !/nope/.test(comments) && /attribute vec2 g/.test(comments), comments);

var old = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0, 1); }';
check('GLSL ES 1.00 is untouched', translate(old, true).source === old);

// The wrapper over the (simulated) WebGL 1 context
var canvas = document.createElement('canvas');
var gl = canvas.getContext('webgl2');
check('webgl2 context', !!gl && typeof gl.drawArraysInstanced === 'function');
check('the same wrapper every time', canvas.getContext('webgl2') === gl);
check('WebGL 1 calls and constants pass through', typeof gl.clear === 'function' && typeof gl.COLOR_BUFFER_BIT === 'number' && gl.canvas === canvas);
check('WebGL 2 constants', gl.RGBA8 === 0x8058 && gl.VERTEX_ARRAY_BINDING === 0x85B5);
check('version', /WebGL 2/.test(gl.getParameter(0x1F02)));

var program = gl.createProgram();
[[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].forEach(function( s ) {
	var shader = gl.createShader(s[0]);
	gl.shaderSource(shader, s[1]);
	gl.compileShader(shader);
	gl.attachShader(program, shader);
	if( s[0] === gl.VERTEX_SHADER ) {
		check('getShaderSource returns the original', gl.getShaderSource(shader) === vertex);
	}
});
gl.linkProgram(program);
check('attribute locations bound before linking', JSON.stringify(program._locations) === '{"g":0,"p":1,"u":2,"c":3,"a":4,"r":5}',
	JSON.stringify(program._locations));

var vao = gl.createVertexArray();
gl.bindVertexArray(vao);
check('VERTEX_ARRAY_BINDING', gl.getParameter(gl.VERTEX_ARRAY_BINDING) === vao);
gl.bindVertexArray(null);
check('unbound', gl.getParameter(gl.VERTEX_ARRAY_BINDING) === null);
gl.texStorage2D(gl.TEXTURE_2D, 3, gl.RGBA8, 8, 8);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
check('sampler calls are accepted', gl.createSampler() && (gl.deleteSampler(gl.createSampler()), true));
console.log('DONE');
