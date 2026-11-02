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
GLuint EJGetBytesPerPixel(GLenum type, GLenum format);

// OpenGL ES 3 takes float textures only with a sized internal format, and
// calls the half float type GL_HALF_FLOAT. Maps WebGL 1's unsized float
// formats and its HALF_FLOAT_OES type to those.
GLenum EJWebGL1InternalFormat(GLenum format, GLenum *type);

#define EJ_ARRAY_MATCHES_TYPE(ARRAY, TYPE) ( \
	(ARRAY == kJSTypedArrayTypeUint8Array && TYPE == GL_UNSIGNED_BYTE) || \
	(ARRAY == kJSTypedArrayTypeFloat32Array && TYPE == GL_FLOAT) || \
	(ARRAY == kJSTypedArrayTypeUint16Array && ( \
		TYPE == GL_HALF_FLOAT_OES || \
		TYPE == GL_HALF_FLOAT || \
		TYPE == GL_UNSIGNED_SHORT_5_6_5 || \
		TYPE == GL_UNSIGNED_SHORT_4_4_4_4 || \
		TYPE == GL_UNSIGNED_SHORT_5_5_5_1 \
	)) \
)

#ifdef __cplusplus
}
#endif
