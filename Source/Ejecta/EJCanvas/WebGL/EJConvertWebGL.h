// Some conversion functions from JavaScript objects to native that didn't fit
// anywhere else.

#import <Foundation/Foundation.h>
#import <JavaScriptCore/JavaScriptCore.h>
#import <OpenGLES/ES3/gl.h>
#import <OpenGLES/ES3/glext.h>

// WebGL 1's OES_texture_half_float type; OpenGL ES 3 calls it GL_HALF_FLOAT
#define GL_HALF_FLOAT_OES 0x8D61

#ifdef __cplusplus
extern "C" {
#endif

GLfloat *JSValueToGLfloatArray(JSContextRef ctx, JSValueRef value, GLsizei elementSize, GLsizei *numElements);
GLint *JSValueToGLintArray(JSContextRef ctx, JSValueRef value, GLsizei elementSize, GLsizei *numElements);
GLuint *JSValueToGLuintArray(JSContextRef ctx, JSValueRef value, GLsizei elementSize, GLsizei *numElements);
GLuint EJGetBytesPerPixel(GLenum type, GLenum format);

// OpenGL ES 3 takes float textures only with a sized internal format, and
// calls the half float type GL_HALF_FLOAT. Maps WebGL 1's unsized float
// formats and its HALF_FLOAT_OES type to those.
GLenum EJWebGL1InternalFormat(GLenum format, GLenum *type);

#define EJ_ARRAY_MATCHES_TYPE(ARRAY, TYPE) ( \
	((ARRAY == kJSTypedArrayTypeUint8Array || ARRAY == kJSTypedArrayTypeUint8ClampedArray) && \
		TYPE == GL_UNSIGNED_BYTE) || \
	(ARRAY == kJSTypedArrayTypeInt8Array && TYPE == GL_BYTE) || \
	(ARRAY == kJSTypedArrayTypeInt16Array && TYPE == GL_SHORT) || \
	(ARRAY == kJSTypedArrayTypeInt32Array && TYPE == GL_INT) || \
	(ARRAY == kJSTypedArrayTypeFloat32Array && TYPE == GL_FLOAT) || \
	(ARRAY == kJSTypedArrayTypeUint16Array && ( \
		TYPE == GL_UNSIGNED_SHORT || \
		TYPE == GL_HALF_FLOAT_OES || \
		TYPE == GL_HALF_FLOAT || \
		TYPE == GL_UNSIGNED_SHORT_5_6_5 || \
		TYPE == GL_UNSIGNED_SHORT_4_4_4_4 || \
		TYPE == GL_UNSIGNED_SHORT_5_5_5_1 \
	)) || \
	(ARRAY == kJSTypedArrayTypeUint32Array && ( \
		TYPE == GL_UNSIGNED_INT || \
		TYPE == GL_UNSIGNED_INT_2_10_10_10_REV || \
		TYPE == GL_UNSIGNED_INT_10F_11F_11F_REV || \
		TYPE == GL_UNSIGNED_INT_5_9_9_9_REV || \
		TYPE == GL_UNSIGNED_INT_24_8 \
	)) \
)

#ifdef __cplusplus
}
#endif
