// WebGL 2 checks for the API simulator, run by `just test-js`: that
// getContext('webgl2') gives the native WebGL 2 binding, with the WebGL 1
// calls it inherits and the OpenGL ES 3 calls it adds. Nothing is drawn here;
// tools/device-tests draws for real.

function check( name, ok, detail ) {
	console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' -- ' + detail));
}

var canvas = document.createElement('canvas');
var gl = canvas.getContext('webgl2');
check('webgl2 context', !!gl);
check('the same context every time', canvas.getContext('webgl2') === gl);
check('no other context on the same canvas', canvas.getContext('webgl') === null && canvas.getContext('2d') === null);
check('version', /^WebGL 2/.test(gl.getParameter(gl.VERSION)) &&
	/GLSL ES 3\.00/.test(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)));
check('getShaderPrecisionFormat', gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision > 0);

var missing = [
	// WebGL 1
	'clear', 'drawArrays', 'texImage2D', 'uniform4fv', 'uniformMatrix4fv', 'vertexAttribPointer',
	// Vertex arrays and instancing
	'createVertexArray', 'bindVertexArray', 'drawArraysInstanced', 'drawElementsInstanced', 'vertexAttribDivisor',
	// Textures and samplers
	'texImage3D', 'texSubImage3D', 'texStorage2D', 'texStorage3D', 'copyTexSubImage3D',
	'createSampler', 'bindSampler', 'samplerParameteri', 'getSamplerParameter',
	// Framebuffers
	'blitFramebuffer', 'renderbufferStorageMultisample', 'framebufferTextureLayer', 'drawBuffers', 'readBuffer',
	'invalidateFramebuffer', 'clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi',
	'getInternalformatParameter',
	// Uniforms, attributes and buffers
	'uniform1ui', 'uniform4uiv', 'uniformMatrix2x3fv', 'uniformMatrix4x3fv', 'vertexAttribI4i', 'vertexAttribI4uiv',
	'vertexAttribIPointer', 'getUniformBlockIndex', 'uniformBlockBinding', 'getActiveUniformBlockParameter',
	'getActiveUniforms', 'getUniformIndices', 'bindBufferBase', 'bindBufferRange', 'getIndexedParameter',
	'getBufferSubData', 'copyBufferSubData', 'drawRangeElements', 'getFragDataLocation',
	// Queries, sync, transform feedback
	'createQuery', 'beginQuery', 'getQueryParameter', 'fenceSync', 'clientWaitSync', 'deleteSync',
	'createTransformFeedback', 'beginTransformFeedback', 'transformFeedbackVaryings', 'getTransformFeedbackVarying'
].filter(function( name ) { return typeof gl[name] !== 'function'; });
check('every WebGL 2 call', missing.length === 0, missing.join(', '));

var constants = ['COLOR_BUFFER_BIT', 'RGBA8', 'TEXTURE_3D', 'TEXTURE_2D_ARRAY', 'UNIFORM_BUFFER', 'READ_FRAMEBUFFER',
	'COLOR_ATTACHMENT15', 'R32UI', 'SYNC_GPU_COMMANDS_COMPLETE', 'TRANSFORM_FEEDBACK', 'INVALID_INDEX']
	.filter(function( name ) { return typeof gl[name] !== 'number'; });
check('WebGL 2 constants', constants.length === 0, constants.join(', '));
check('MAX_CLIENT_WAIT_TIMEOUT_WEBGL', gl.MAX_CLIENT_WAIT_TIMEOUT_WEBGL === 0x9247 && gl.TIMEOUT_IGNORED === -1,
	gl.MAX_CLIENT_WAIT_TIMEOUT_WEBGL + ' ' + gl.TIMEOUT_IGNORED);

var webgl1 = document.createElement('canvas').getContext('webgl');
check('WebGL 1 has no WebGL 2 calls', webgl1 && !('texImage3D' in webgl1) &&
	/^WebGL 1/.test(webgl1.getParameter(webgl1.VERSION)));
console.log('DONE');
