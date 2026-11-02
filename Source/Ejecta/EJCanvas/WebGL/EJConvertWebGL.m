#import "EJConvertWebGL.h"
#import "EJConvert.h"

// FIXME: use C++ with a template?
#define CREATE_JS_VALUE_TO_ARRAY_FUNC(NAME, TYPE, ARRAY_TYPE) \
TYPE *NAME(JSContextRef ctx, JSValueRef value, GLsizei elementSize, GLsizei *numElements) { \
	if( !JSValueIsObject(ctx, value) ) { \
		return NULL; \
	} \
	JSObjectRef jsObject = (JSObjectRef)value; \
	if( JSValueGetTypedArrayType(ctx, jsObject, NULL) == ARRAY_TYPE ) { \
		size_t byteLength = 0; \
		TYPE *arrayValue = JSValueGetTypedArrayPtr(ctx, jsObject, &byteLength); \
		GLsizei count = (GLsizei)(byteLength/sizeof(TYPE)); \
		if( arrayValue && count && (count % elementSize) == 0 ) { \
			*numElements = count / elementSize; \
			return arrayValue; \
		} \
	} \
	else { \
		JSStringRef jsLengthName = JSStringCreateWithUTF8CString("length"); \
		GLsizei count = JSValueToNumberFast(ctx, JSObjectGetProperty(ctx, jsObject, jsLengthName, NULL)); \
		JSStringRelease(jsLengthName); \
		\
		if( count && (count % elementSize) == 0 ) { \
			NSMutableData *buffer = [NSMutableData dataWithLength:count * sizeof(TYPE)]; \
			TYPE *values = buffer.mutableBytes; \
			for( int i = 0; i < count; i++ ) { \
				values[i] = JSValueToNumberFast(ctx, JSObjectGetPropertyAtIndex(ctx, jsObject, i, NULL)); \
			} \
			*numElements = count / elementSize; \
			return values; \
		} \
	} \
	\
	*numElements = 0; \
	return NULL; \
}

CREATE_JS_VALUE_TO_ARRAY_FUNC( JSValueToGLfloatArray, GLfloat, kJSTypedArrayTypeFloat32Array);
CREATE_JS_VALUE_TO_ARRAY_FUNC( JSValueToGLintArray, GLint, kJSTypedArrayTypeInt32Array);
CREATE_JS_VALUE_TO_ARRAY_FUNC( JSValueToGLuintArray, GLuint, kJSTypedArrayTypeUint32Array);

#undef CREATE_JS_VALUE_TO_ARRAY_FUNC

#define CREATE_JS_VALUE_TO_ARRAY_RANGE_FUNC(NAME, TYPE) \
TYPE *NAME##Range(JSContextRef ctx, JSValueRef value, GLsizei elementSize, \
	GLsizei srcOffset, GLsizei srcLength, GLsizei *numElements \
) { \
	*numElements = 0; \
	GLsizei count; \
	TYPE *values = NAME(ctx, value, 1, &count); \
	if( !values || srcOffset < 0 || srcLength < 0 || srcOffset > count ) { return NULL; } \
	GLsizei length = srcLength ? srcLength : count - srcOffset; \
	if( !length || length > count - srcOffset || (length % elementSize) != 0 ) { return NULL; } \
	*numElements = length / elementSize; \
	return values + srcOffset; \
}

CREATE_JS_VALUE_TO_ARRAY_RANGE_FUNC( JSValueToGLfloatArray, GLfloat );
CREATE_JS_VALUE_TO_ARRAY_RANGE_FUNC( JSValueToGLintArray, GLint );
CREATE_JS_VALUE_TO_ARRAY_RANGE_FUNC( JSValueToGLuintArray, GLuint );

#undef CREATE_JS_VALUE_TO_ARRAY_RANGE_FUNC


GLuint EJGetBytesPerPixel(GLenum type, GLenum format) {
	int bytesPerComponent = 0;
	switch( type ) {
		case GL_UNSIGNED_BYTE:
		case GL_BYTE:
			bytesPerComponent = 1;
			break;
		case GL_UNSIGNED_SHORT:
		case GL_SHORT:
		case GL_HALF_FLOAT_OES:
		case GL_HALF_FLOAT:
			bytesPerComponent = 2;
			break;
		case GL_UNSIGNED_INT:
		case GL_INT:
		case GL_FLOAT:
			bytesPerComponent = 4;
			break;
		
		// Packed: all components in one value
		case GL_UNSIGNED_SHORT_5_6_5:
		case GL_UNSIGNED_SHORT_4_4_4_4:
		case GL_UNSIGNED_SHORT_5_5_5_1:
			return 2;
		case GL_UNSIGNED_INT_2_10_10_10_REV:
		case GL_UNSIGNED_INT_10F_11F_11F_REV:
		case GL_UNSIGNED_INT_5_9_9_9_REV:
		case GL_UNSIGNED_INT_24_8:
			return 4;
		case GL_FLOAT_32_UNSIGNED_INT_24_8_REV:
			return 8;
	}
	
	switch( format ) {
		case GL_LUMINANCE:
		case GL_ALPHA:
		case GL_RED:
		case GL_RED_INTEGER:
		case GL_DEPTH_COMPONENT:
			return 1 * bytesPerComponent;
		case GL_LUMINANCE_ALPHA:
		case GL_RG:
		case GL_RG_INTEGER:
			return 2 * bytesPerComponent;
		case GL_RGB:
		case GL_RGB_INTEGER:
			return 3 * bytesPerComponent;
		case GL_RGBA:
		case GL_RGBA_INTEGER:
			return 4 * bytesPerComponent;
	}
	return 0;
}

GLenum EJWebGL1InternalFormat(GLenum format, GLenum *type) {
	if( *type == GL_HALF_FLOAT_OES ) {
		*type = GL_HALF_FLOAT;
	}
	
	if( *type == GL_FLOAT ) {
		switch( format ) {
			case GL_RGBA: return GL_RGBA32F;
			case GL_RGB: return GL_RGB32F;
		}
	}
	else if( *type == GL_HALF_FLOAT ) {
		switch( format ) {
			case GL_RGBA: return GL_RGBA16F;
			case GL_RGB: return GL_RGB16F;
		}
	}
	return format;
}
