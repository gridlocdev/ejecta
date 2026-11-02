#import "EJBindingCanvasContextWebGL2.h"
#import "EJBindingWebGLObjects.h"
#import "EJBindingWebGLExtensions.h"
#import "EJConvertWebGL.h"
#import "EJJavaScriptView.h"
#import "EJDrawable.h"

@implementation EJBindingCanvasContextWebGL2

- (id)initWithRenderingContext:(EJCanvasContextWebGL *)renderingContextp {
	if( self = [super initWithRenderingContext:renderingContextp] ) {
		samplers = [NSMutableDictionary new];
	}
	return self;
}

- (void)dealloc {
	EAGLContext *oldContext = [EAGLContext currentContext];
	[EAGLContext setCurrentContext:renderingContext.glContext];
	
	for( NSNumber *n in samplers ) { GLuint sampler = n.intValue; glDeleteSamplers(1, &sampler); }
	[samplers release];
	
	[EAGLContext setCurrentContext:oldContext];
	[super dealloc];
}

- (void)deleteSampler:(GLuint)sampler {
	NSNumber *key = @(sampler);
	if( samplers[key] ) {
		scriptView.currentRenderingContext = renderingContext;
		glDeleteSamplers(1, &sampler);
		[samplers removeObjectForKey:key];
	}
}

- (int)webglVersion {
	return EJ_WEBGL_2;
}

- (JSValueRef)jsObjectOrNull:(NSValue *)value ctx:(JSContextRef)ctx {
	return value ? value.pointerValue : JSValueMakeNull(ctx);
}


// ------------------------------------------------------------------------------------
// Methods

// Shorthand to directly bind a c function that only takes numbers
#define EJ_BIND_FUNCTION_DIRECT(NAME, BINDING, ...) \
	EJ_BIND_FUNCTION(NAME, ctx, argc, argv) { \
		if( argc < EJ_ARGC(__VA_ARGS__) ) { return NULL; } \
		scriptView.currentRenderingContext = renderingContext; \
		BINDING( EJ_MAP_EXT(0, _EJ_COMMA, _EJ_BIND_FUNCTION_DIRECT_UNPACK, __VA_ARGS__) ); \
		return NULL;\
	}
#define _EJ_BIND_FUNCTION_DIRECT_UNPACK(INDEX, IGNORED) JSValueToNumberFast(ctx, argv[INDEX])


EJ_BIND_FUNCTION(getParameter, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	
	scriptView.currentRenderingContext = renderingContext;
	GLenum pname = JSValueToNumberFast(ctx, argv[0]);
	
	GLint intvalue;
	GLint64 int64value;
	GLfloat floatvalue;
	
	switch( pname ) {
		// string
		case GL_VERSION:
			return NSStringToJSValue(ctx, [NSString stringWithFormat:@"WebGL 2.0 (%s)", glGetString(pname)]);
		
		case GL_SHADING_LANGUAGE_VERSION:
			return NSStringToJSValue(ctx, [NSString stringWithFormat:@"WebGL GLSL ES 3.00 (%s)", glGetString(pname)]);
		
		// WebGLBuffer
		case GL_COPY_READ_BUFFER_BINDING:
		case GL_COPY_WRITE_BUFFER_BINDING:
		case GL_PIXEL_PACK_BUFFER_BINDING:
		case GL_PIXEL_UNPACK_BUFFER_BINDING:
		case GL_TRANSFORM_FEEDBACK_BUFFER_BINDING:
		case GL_UNIFORM_BUFFER_BINDING:
			glGetIntegerv(pname, &intvalue);
			return [self jsObjectOrNull:buffers[@(intvalue)] ctx:ctx];
		
		// WebGLFramebuffer
		case GL_READ_FRAMEBUFFER_BINDING:
			glGetIntegerv(pname, &intvalue);
			return [self jsObjectOrNull:framebuffers[@(intvalue)] ctx:ctx];
		
		// WebGLTexture
		case GL_TEXTURE_BINDING_3D:
		case GL_TEXTURE_BINDING_2D_ARRAY:
			glGetIntegerv(pname, &intvalue);
			return [self jsObjectOrNull:textures[@(intvalue)] ctx:ctx];
		
		// WebGLSampler
		case GL_SAMPLER_BINDING:
			glGetIntegerv(pname, &intvalue);
			return [self jsObjectOrNull:samplers[@(intvalue)] ctx:ctx];
		
		// WebGLVertexArrayObject
		case GL_VERTEX_ARRAY_BINDING:
			glGetIntegerv(pname, &intvalue);
			return [self jsObjectOrNull:vertexArrays[@(intvalue)] ctx:ctx];
		
		// boolean
		case GL_RASTERIZER_DISCARD:
		case GL_TRANSFORM_FEEDBACK_ACTIVE:
		case GL_TRANSFORM_FEEDBACK_PAUSED:
		case GL_PRIMITIVE_RESTART_FIXED_INDEX:
			glGetIntegerv(pname, &intvalue);
			return JSValueMakeBoolean(ctx, intvalue);
		
		// single float
		case GL_MAX_TEXTURE_LOD_BIAS:
			glGetFloatv(pname, &floatvalue);
			return JSValueMakeNumber(ctx, floatvalue);
		
		// 64 bit int
		case GL_MAX_ELEMENT_INDEX:
		case GL_MAX_SERVER_WAIT_TIMEOUT:
		case GL_MAX_UNIFORM_BLOCK_SIZE:
		case GL_MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS:
		case GL_MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS:
			glGetInteger64v(pname, &int64value);
			return JSValueMakeNumber(ctx, int64value);
		
		// Timeouts can't be longer than this; clientWaitSync doesn't block
		case 0x9247: // MAX_CLIENT_WAIT_TIMEOUT_WEBGL
			return JSValueMakeNumber(ctx, 0);
	}
	
	return [super _func_getParameter:ctx argc:argc argv:argv];
}


// Vertex arrays

EJ_BIND_FUNCTION(createVertexArray, ctx, argc, argv) {
	scriptView.currentRenderingContext = renderingContext;
	
	GLuint vertexArray;
	glGenVertexArrays(1, &vertexArray);
	JSObjectRef obj = [EJBindingWebGLVertexArrayObject createJSObjectWithContext:ctx
		scriptView:scriptView webglContext:self index:vertexArray];
	[self addVertexArray:vertexArray obj:obj];
	return obj;
}

EJ_BIND_FUNCTION(deleteVertexArray, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	
	[[EJBindingWebGLVertexArrayObject webGLObjectFromJSValue:argv[0]] invalidate];
	return NULL;
}

EJ_BIND_FUNCTION(isVertexArray, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	
	scriptView.currentRenderingContext = renderingContext;
	GLuint index = [EJBindingWebGLVertexArrayObject indexFromJSValue:argv[0]];
	return JSValueMakeBoolean(ctx, glIsVertexArray(index));
}

EJ_BIND_FUNCTION(bindVertexArray, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	
	scriptView.currentRenderingContext = renderingContext;
	GLuint index = [EJBindingWebGLVertexArrayObject indexFromJSValue:argv[0]];
	glBindVertexArray(index);
	return NULL;
}


// Instancing

EJ_BIND_FUNCTION_DIRECT(drawArraysInstanced, glDrawArraysInstanced, mode, first, count, instanceCount);
EJ_BIND_FUNCTION_DIRECT(vertexAttribDivisor, glVertexAttribDivisor, index, divisor);

EJ_BIND_FUNCTION(drawElementsInstanced, ctx, argc, argv) {
	EJ_UNPACK_ARGV(GLenum mode, GLsizei count, GLenum type, GLint offset, GLsizei instanceCount);
	
	scriptView.currentRenderingContext = renderingContext;
	glDrawElementsInstanced(mode, count, type, EJ_BUFFER_OFFSET(offset), instanceCount);
	return NULL;
}


// Textures

// The unpack state OpenGL applies to pixels from client memory or a pixel
// buffer
typedef struct {
	GLint alignment, rowLength, imageHeight, skipPixels, skipRows, skipImages;
} EJUnpackState;

static const EJUnpackState EJUnpackStateTight = {1, 0, 0, 0, 0, 0};

static EJUnpackState EJGetUnpackState() {
	EJUnpackState state;
	glGetIntegerv(GL_UNPACK_ALIGNMENT, &state.alignment);
	glGetIntegerv(GL_UNPACK_ROW_LENGTH, &state.rowLength);
	glGetIntegerv(GL_UNPACK_IMAGE_HEIGHT, &state.imageHeight);
	glGetIntegerv(GL_UNPACK_SKIP_PIXELS, &state.skipPixels);
	glGetIntegerv(GL_UNPACK_SKIP_ROWS, &state.skipRows);
	glGetIntegerv(GL_UNPACK_SKIP_IMAGES, &state.skipImages);
	return state;
}

static void EJSetUnpackState(EJUnpackState state) {
	glPixelStorei(GL_UNPACK_ALIGNMENT, state.alignment);
	glPixelStorei(GL_UNPACK_ROW_LENGTH, state.rowLength);
	glPixelStorei(GL_UNPACK_IMAGE_HEIGHT, state.imageHeight);
	glPixelStorei(GL_UNPACK_SKIP_PIXELS, state.skipPixels);
	glPixelStorei(GL_UNPACK_SKIP_ROWS, state.skipRows);
	glPixelStorei(GL_UNPACK_SKIP_IMAGES, state.skipImages);
}

static size_t EJTypedArrayElementSize(JSTypedArrayType type) {
	switch( type ) {
		case kJSTypedArrayTypeInt16Array:
		case kJSTypedArrayTypeUint16Array:
			return 2;
		case kJSTypedArrayTypeInt32Array:
		case kJSTypedArrayTypeUint32Array:
		case kJSTypedArrayTypeFloat32Array:
			return 4;
		case kJSTypedArrayTypeFloat64Array:
		case kJSTypedArrayTypeBigInt64Array:
		case kJSTypedArrayTypeBigUint64Array:
			return 8;
		default:
			return 1;
	}
}

// Converts RGBA bytes to the channels of format, in place. NO if format and
// type aren't bytes.
static BOOL EJConvertRGBA8(GLubyte *pixels, int count, GLenum format, GLenum type) {
	if( type != GL_UNSIGNED_BYTE ) { return NO; }
	
	static const int rgb[] = {0, 1, 2}, rg[] = {0, 1}, red[] = {0}, alpha[] = {3}, luminanceAlpha[] = {0, 3};
	const int *channels;
	int channelCount;
	switch( format ) {
		case GL_RGBA: return YES;
		case GL_RGB: channels = rgb; channelCount = 3; break;
		case GL_RG: channels = rg; channelCount = 2; break;
		case GL_RED:
		case GL_LUMINANCE: channels = red; channelCount = 1; break;
		case GL_ALPHA: channels = alpha; channelCount = 1; break;
		case GL_LUMINANCE_ALPHA: channels = luminanceAlpha; channelCount = 2; break;
		default: return NO;
	}
	
	// Each pixel is written at or before where it's read from
	GLubyte *out = pixels;
	for( int i = 0; i < count; i++, pixels += 4 ) {
		for( int c = 0; c < channelCount; c++ ) {
			*out++ = pixels[channels[c]];
		}
	}
	return YES;
}

// WebGL 1 code can pass an unsized float format, as OES_texture_float allowed
static GLenum EJInternalFormat(GLenum internalformat, GLenum format, GLenum *type) {
	GLenum webgl1Format = EJWebGL1InternalFormat(format, type);
	return internalformat == format ? webgl1Format : internalformat;
}

- (BOOL)unpackBufferBound {
	GLint buffer;
	glGetIntegerv(GL_PIXEL_UNPACK_BUFFER_BINDING, &buffer);
	return buffer != 0;
}

// Calls change with the texture for target on the active unit bound, after
// making it mutable. Does nothing if no texture is bound there. 3D calls take
// 3D and 2D array textures, the others 2D and cube map textures.
- (void)changeTextureAtTarget:(GLenum)target is3D:(BOOL)is3D keepPixels:(BOOL)keepPixels
	change:(void (^)(void))change
{
	GLenum bindTarget = [self bindTargetForImageTarget:target];
	int slot = [self textureSlotForTarget:bindTarget];
	BOOL slotIs3D = (slot == kEJTextureSlot3D || slot == kEJTextureSlot2DArray);
	EJTexture *texture = (slot >= 0 && slotIs3D == is3D) ? activeTexture->textures[slot] : nil;
	if( !texture ) { return; }
	
	GLint oldTextureId = texture.textureId;
	[texture ensureMutableKeepPixels:keepPixels forTarget:bindTarget];
	[texture bindToTarget:bindTarget];
	change();
	[self updateTexture:texture jsTexture:activeTexture->jsTextures[slot]
		oldTextureId:oldTextureId bindTarget:bindTarget];
}

// Shares the OpenGL texture of an image instead of copying its pixels, when
// none of them have to change
- (BOOL)shareTextureOfImage:(JSValueRef)value target:(GLenum)target level:(GLint)level
	internalformat:(GLenum)internalformat format:(GLenum)format type:(GLenum)type
{
	if(
		target != GL_TEXTURE_2D || level != 0 || unpackFlipY || !premultiplyAlpha ||
		(internalformat != GL_RGBA && internalformat != GL_RGBA8) ||
		format != GL_RGBA || type != GL_UNSIGNED_BYTE
	) {
		return NO;
	}
	
	NSObject<EJDrawable> *drawable = (NSObject<EJDrawable> *)JSValueGetPrivate(value);
	if( !drawable || ![drawable conformsToProtocol:@protocol(EJDrawable)] ) { return NO; }
	
	EJTexture *source = drawable.texture;
	EJTexture *texture = activeTexture->textures[kEJTextureSlot2D];
	if( !source || source.isDynamic || !texture ) { return NO; }
	
	GLint oldTextureId = texture.textureId;
	[texture createWithTexture:source];
	[self updateTexture:texture jsTexture:activeTexture->jsTextures[kEJTextureSlot2D]
		oldTextureId:oldTextureId bindTarget:GL_TEXTURE_2D];
	[source maybeReleaseStorage];
	return YES;
}

// Calls upload with the pixels of value. They can be:
//  - an Image, Canvas or ImageData: its own size; width and height are ignored
//  - an ArrayBufferView, from element srcOffset
//  - an offset into the bound PIXEL_UNPACK_BUFFER
//  - null: zeros, if allowNull
// Images and arrays are flipped and premultiplied as UNPACK_FLIP_Y_WEBGL and
// UNPACK_PREMULTIPLY_ALPHA_WEBGL say, on a copy; for arrays that's 2D only, as
// in WebGL 2.
- (void)withPixels:(JSValueRef)value srcOffset:(size_t)srcOffset ctx:(JSContextRef)ctx
	width:(GLsizei)width height:(GLsizei)height depth:(GLsizei)depth
	format:(GLenum)format type:(GLenum)type allowNull:(BOOL)allowNull is3D:(BOOL)is3D
	upload:(void (^)(GLsizei width, GLsizei height, const void *pixels))upload
{
	// Offset into the pixel buffer
	if( JSValueIsNumber(ctx, value) ) {
		if( [self unpackBufferBound] ) {
			upload(width, height, EJ_BUFFER_OFFSET((size_t)JSValueToNumberFast(ctx, value)));
		}
		return;
	}
	
	// Client memory can't be used while a pixel buffer is bound
	if( [self unpackBufferBound] ) { return; }
	
	// Zeros
	if( JSValueIsNull(ctx, value) || JSValueIsUndefined(ctx, value) ) {
		if( !allowNull ) { return; }
		
		GLuint bytesPerPixel = EJGetBytesPerPixel(type, format);
		void *zeros = bytesPerPixel ? calloc((size_t)width * height * depth, bytesPerPixel) : NULL;
		EJUnpackState state = EJGetUnpackState();
		EJSetUnpackState(EJUnpackStateTight);
		upload(width, height, zeros);
		EJSetUnpackState(state);
		free(zeros);
		return;
	}
	
	// Image, Canvas or ImageData: RGBA bytes, premultiplied
	NSObject<EJDrawable> *drawable = (NSObject<EJDrawable> *)JSValueGetPrivate(value);
	if( drawable && [drawable conformsToProtocol:@protocol(EJDrawable)] ) {
		if( is3D ) {
			NSLog(@"Warning: 3D textures can't be made from an Image, ImageData or Canvas element");
			return;
		}
		
		EJTexture *source = drawable.texture;
		
		// A new copy of the pixels, so it can be changed
		GLubyte *pixels = source.pixels.mutableBytes;
		if( pixels ) {
			GLsizei sourceWidth = source.width;
			GLsizei sourceHeight = source.height;
			if( unpackFlipY ) {
				[EJTexture flipPixelsY:pixels bytesPerRow:(sourceWidth * 4) rows:sourceHeight];
			}
			if( !premultiplyAlpha ) {
				[EJTexture unPremultiplyPixels:pixels to:pixels byteLength:(sourceWidth * sourceHeight * 4) format:GL_RGBA];
			}
			
			if( EJConvertRGBA8(pixels, sourceWidth * sourceHeight, format, type) ) {
				EJUnpackState state = EJGetUnpackState();
				EJSetUnpackState(EJUnpackStateTight);
				upload(sourceWidth, sourceHeight, pixels);
				EJSetUnpackState(state);
			}
			else {
				NSLog(@"Warning: textures from an Image, ImageData or Canvas element must have UNSIGNED_BYTE data");
			}
		}
		
		[source maybeReleaseStorage];
		return;
	}
	
	// ArrayBufferView
	JSTypedArrayType arrayType = JSValueGetTypedArrayType(ctx, value, NULL);
	if( !EJ_ARRAY_MATCHES_TYPE(arrayType, type) ) { return; }
	
	GLuint bytesPerPixel = EJGetBytesPerPixel(type, format);
	if( !bytesPerPixel ) { return; }
	
	size_t byteLength = 0;
	GLubyte *data = JSValueGetTypedArrayPtr(ctx, value, &byteLength);
	size_t offset = srcOffset * EJTypedArrayElementSize(arrayType);
	if( offset > byteLength ) { return; }
	data += offset;
	byteLength -= offset;
	
	// The bytes OpenGL reads, with the unpack state
	EJUnpackState state = EJGetUnpackState();
	size_t rowPixels = state.rowLength ? state.rowLength : width;
	size_t bytesPerRow = (rowPixels * bytesPerPixel + state.alignment - 1) / state.alignment * state.alignment;
	size_t bytesPerImage = bytesPerRow * (state.imageHeight ? state.imageHeight : height);
	size_t neededLength = 0;
	if( width && height && depth ) {
		neededLength = (state.skipPixels + width) * bytesPerPixel +
			(state.skipRows + height - 1) * bytesPerRow +
			(is3D ? (state.skipImages + depth - 1) * bytesPerImage : 0);
	}
	if( byteLength < neededLength ) { return; }
	
	BOOL premultiply = premultiplyAlpha && type == GL_UNSIGNED_BYTE;
	if( is3D || (!unpackFlipY && !premultiply) ) {
		upload(width, height, data);
		return;
	}
	
	GLubyte *copy = malloc(neededLength);
	memcpy(copy, data, neededLength);
	
	GLubyte *firstRow = copy + state.skipRows * bytesPerRow + state.skipPixels * bytesPerPixel;
	size_t rowLength = width * bytesPerPixel;
	if( unpackFlipY ) {
		GLubyte *swap = malloc(rowLength);
		for( GLsizei y = 0; y < height / 2; y++ ) {
			GLubyte *top = firstRow + y * bytesPerRow;
			GLubyte *bottom = firstRow + (height - 1 - y) * bytesPerRow;
			memcpy(swap, top, rowLength);
			memcpy(top, bottom, rowLength);
			memcpy(bottom, swap, rowLength);
		}
		free(swap);
	}
	if( premultiply ) {
		for( GLsizei y = 0; y < height; y++ ) {
			GLubyte *row = firstRow + y * bytesPerRow;
			[EJTexture premultiplyPixels:row to:row byteLength:(int)rowLength format:format];
		}
	}
	
	upload(width, height, copy);
	free(copy);
}

EJ_BIND_FUNCTION(texImage2D, ctx, argc, argv) {
	// texImage2D(target, level, internalformat, format, type, source)
	// texImage2D(target, level, internalformat, width, height, border, format, type, source)
	// texImage2D(target, level, internalformat, width, height, border, format, type, srcData, srcOffset)
	if( argc < 6 ) { return NULL; }
	EJ_UNPACK_ARGV(GLenum target, GLint level, GLenum internalformat);
	
	scriptView.currentRenderingContext = renderingContext;
	
	BOOL sized = (argc >= 9);
	GLsizei width = sized ? JSValueToNumberFast(ctx, argv[3]) : 0;
	GLsizei height = sized ? JSValueToNumberFast(ctx, argv[4]) : 0;
	GLenum format = JSValueToNumberFast(ctx, argv[sized ? 6 : 3]);
	GLenum type = JSValueToNumberFast(ctx, argv[sized ? 7 : 4]);
	int source = sized ? 8 : 5;
	size_t srcOffset = argc > source + 1 ? JSValueToNumberFast(ctx, argv[source + 1]) : 0;
	GLenum internal = EJInternalFormat(internalformat, format, &type);
	
	if( [self shareTextureOfImage:argv[source] target:target level:level
		internalformat:internal format:format type:type]
	) {
		return NULL;
	}
	
	// If we write mip level 0, there's no point in keeping pixels
	[self changeTextureAtTarget:target is3D:NO keepPixels:(level != 0) change:^{
		[self withPixels:argv[source] srcOffset:srcOffset ctx:ctx width:width height:height depth:1
			format:format type:type allowNull:YES is3D:NO
			upload:^(GLsizei w, GLsizei h, const void *pixels) {
				glTexImage2D(target, level, internal, w, h, 0, format, type, pixels);
			}];
	}];
	return NULL;
}

EJ_BIND_FUNCTION(texSubImage2D, ctx, argc, argv) {
	// texSubImage2D(target, level, xoffset, yoffset, format, type, source)
	// texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, source)
	// texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, srcData, srcOffset)
	if( argc < 7 ) { return NULL; }
	EJ_UNPACK_ARGV(GLenum target, GLint level, GLint xoffset, GLint yoffset);
	
	scriptView.currentRenderingContext = renderingContext;
	
	BOOL sized = (argc >= 9);
	GLsizei width = sized ? JSValueToNumberFast(ctx, argv[4]) : 0;
	GLsizei height = sized ? JSValueToNumberFast(ctx, argv[5]) : 0;
	GLenum format = JSValueToNumberFast(ctx, argv[sized ? 6 : 4]);
	GLenum type = JSValueToNumberFast(ctx, argv[sized ? 7 : 5]);
	int source = sized ? 8 : 6;
	size_t srcOffset = argc > source + 1 ? JSValueToNumberFast(ctx, argv[source + 1]) : 0;
	EJWebGL1InternalFormat(format, &type);
	
	// Keep the pixels: only part of the texture changes
	[self changeTextureAtTarget:target is3D:NO keepPixels:YES change:^{
		[self withPixels:argv[source] srcOffset:srcOffset ctx:ctx width:width height:height depth:1
			format:format type:type allowNull:NO is3D:NO
			upload:^(GLsizei w, GLsizei h, const void *pixels) {
				glTexSubImage2D(target, level, xoffset, yoffset, w, h, format, type, pixels);
			}];
	}];
	return NULL;
}

EJ_BIND_FUNCTION(texImage3D, ctx, argc, argv) {
	// texImage3D(target, level, internalformat, width, height, depth, border, format, type, source)
	// texImage3D(target, level, internalformat, width, height, depth, border, format, type, srcData, srcOffset)
	if( argc < 10 ) { return NULL; }
	EJ_UNPACK_ARGV(GLenum target, GLint level, GLenum internalformat,
		GLsizei width, GLsizei height, GLsizei depth, GLint border, GLenum format, GLenum type);
	
	scriptView.currentRenderingContext = renderingContext;
	
	size_t srcOffset = argc > 10 ? JSValueToNumberFast(ctx, argv[10]) : 0;
	GLenum internal = EJInternalFormat(internalformat, format, &type);
	
	[self changeTextureAtTarget:target is3D:YES keepPixels:(level != 0) change:^{
		[self withPixels:argv[9] srcOffset:srcOffset ctx:ctx width:width height:height depth:depth
			format:format type:type allowNull:YES is3D:YES
			upload:^(GLsizei w, GLsizei h, const void *pixels) {
				glTexImage3D(target, level, internal, w, h, depth, border, format, type, pixels);
			}];
	}];
	return NULL;
}

EJ_BIND_FUNCTION(texSubImage3D, ctx, argc, argv) {
	// texSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, source)
	// texSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, srcData, srcOffset)
	if( argc < 11 ) { return NULL; }
	EJ_UNPACK_ARGV(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLint zoffset,
		GLsizei width, GLsizei height, GLsizei depth, GLenum format, GLenum type);
	
	scriptView.currentRenderingContext = renderingContext;
	
	size_t srcOffset = argc > 11 ? JSValueToNumberFast(ctx, argv[11]) : 0;
	EJWebGL1InternalFormat(format, &type);
	
	[self changeTextureAtTarget:target is3D:YES keepPixels:YES change:^{
		[self withPixels:argv[10] srcOffset:srcOffset ctx:ctx width:width height:height depth:depth
			format:format type:type allowNull:NO is3D:YES
			upload:^(GLsizei w, GLsizei h, const void *pixels) {
				glTexSubImage3D(target, level, xoffset, yoffset, zoffset, w, h, depth, format, type, pixels);
			}];
	}];
	return NULL;
}

EJ_BIND_FUNCTION(texStorage2D, ctx, argc, argv) {
	EJ_UNPACK_ARGV(GLenum target, GLsizei levels, GLenum internalformat, GLsizei width, GLsizei height);
	
	scriptView.currentRenderingContext = renderingContext;
	
	[self changeTextureAtTarget:target is3D:NO keepPixels:NO change:^{
		glTexStorage2D(target, levels, internalformat, width, height);
	}];
	return NULL;
}

EJ_BIND_FUNCTION(texStorage3D, ctx, argc, argv) {
	EJ_UNPACK_ARGV(GLenum target, GLsizei levels, GLenum internalformat,
		GLsizei width, GLsizei height, GLsizei depth);
	
	scriptView.currentRenderingContext = renderingContext;
	
	[self changeTextureAtTarget:target is3D:YES keepPixels:NO change:^{
		glTexStorage3D(target, levels, internalformat, width, height, depth);
	}];
	return NULL;
}

EJ_BIND_FUNCTION(copyTexSubImage3D, ctx, argc, argv) {
	EJ_UNPACK_ARGV(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLint zoffset,
		GLint x, GLint y, GLsizei width, GLsizei height);
	
	scriptView.currentRenderingContext = renderingContext;
	
	[self changeTextureAtTarget:target is3D:YES keepPixels:YES change:^{
		glCopyTexSubImage3D(target, level, xoffset, yoffset, zoffset, x, y, width, height);
	}];
	return NULL;
}

EJ_BIND_FUNCTION_NOT_IMPLEMENTED(compressedTexImage3D);
EJ_BIND_FUNCTION_NOT_IMPLEMENTED(compressedTexSubImage3D);


// Samplers

EJ_BIND_FUNCTION(createSampler, ctx, argc, argv) {
	scriptView.currentRenderingContext = renderingContext;
	
	GLuint sampler;
	glGenSamplers(1, &sampler);
	JSObjectRef obj = [EJBindingWebGLSampler createJSObjectWithContext:ctx
		scriptView:scriptView webglContext:self index:sampler];
	samplers[@(sampler)] = [NSValue valueWithPointer:obj];
	return obj;
}

EJ_BIND_FUNCTION(deleteSampler, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	
	[[EJBindingWebGLSampler webGLObjectFromJSValue:argv[0]] invalidate];
	return NULL;
}

EJ_BIND_FUNCTION(isSampler, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	
	scriptView.currentRenderingContext = renderingContext;
	GLuint sampler = [EJBindingWebGLSampler indexFromJSValue:argv[0]];
	return JSValueMakeBoolean(ctx, glIsSampler(sampler));
}

EJ_BIND_FUNCTION(bindSampler, ctx, argc, argv) {
	if( argc < 2 ) { return NULL; }
	
	scriptView.currentRenderingContext = renderingContext;
	GLuint unit = JSValueToNumberFast(ctx, argv[0]);
	GLuint sampler = [EJBindingWebGLSampler indexFromJSValue:argv[1]];
	glBindSampler(unit, sampler);
	return NULL;
}

EJ_BIND_FUNCTION(samplerParameteri, ctx, argc, argv) {
	if( argc < 3 ) { return NULL; }
	
	scriptView.currentRenderingContext = renderingContext;
	GLuint sampler = [EJBindingWebGLSampler indexFromJSValue:argv[0]];
	glSamplerParameteri(sampler, JSValueToNumberFast(ctx, argv[1]), JSValueToNumberFast(ctx, argv[2]));
	return NULL;
}

EJ_BIND_FUNCTION(samplerParameterf, ctx, argc, argv) {
	if( argc < 3 ) { return NULL; }
	
	scriptView.currentRenderingContext = renderingContext;
	GLuint sampler = [EJBindingWebGLSampler indexFromJSValue:argv[0]];
	glSamplerParameterf(sampler, JSValueToNumberFast(ctx, argv[1]), JSValueToNumberFast(ctx, argv[2]));
	return NULL;
}

EJ_BIND_FUNCTION(getSamplerParameter, ctx, argc, argv) {
	if( argc < 2 ) { return NULL; }
	
	scriptView.currentRenderingContext = renderingContext;
	GLuint sampler = [EJBindingWebGLSampler indexFromJSValue:argv[0]];
	GLenum pname = JSValueToNumberFast(ctx, argv[1]);
	
	if( pname == GL_TEXTURE_MIN_LOD || pname == GL_TEXTURE_MAX_LOD ) {
		GLfloat value;
		glGetSamplerParameterfv(sampler, pname, &value);
		return JSValueMakeNumber(ctx, value);
	}
	
	GLint value;
	glGetSamplerParameteriv(sampler, pname, &value);
	return JSValueMakeNumber(ctx, value);
}


// Framebuffers

// The canvas's own framebuffer has the buffers BACK, or COLOR, DEPTH and
// STENCIL. In OpenGL it's a framebuffer object with attachments.
- (GLenum)attachmentForBuffer:(GLenum)buffer target:(GLenum)target {
	if( ![renderingContext defaultFramebufferIsBound:target] ) { return buffer; }
	
	switch( buffer ) {
		case GL_BACK:
		case GL_COLOR: return GL_COLOR_ATTACHMENT0;
		case GL_DEPTH: return GL_DEPTH_ATTACHMENT;
		case GL_STENCIL: return GL_STENCIL_ATTACHMENT;
	}
	return buffer;
}

EJ_BIND_FUNCTION_DIRECT(blitFramebuffer, glBlitFramebuffer,
	srcX0, srcY0, srcX1, srcY1, dstX0, dstY0, dstX1, dstY1, mask, filter);

EJ_BIND_FUNCTION(renderbufferStorageMultisample, ctx, argc, argv) {
	EJ_UNPACK_ARGV(GLenum target, GLsizei samples, GLenum internalformat, GLsizei width, GLsizei height);
	
	scriptView.currentRenderingContext = renderingContext;
	
	if( internalformat == GL_DEPTH_STENCIL ) {
		internalformat = GL_DEPTH24_STENCIL8;
	}
	glRenderbufferStorageMultisample(target, samples, internalformat, width, height);
	return NULL;
}

EJ_BIND_FUNCTION(framebufferTextureLayer, ctx, argc, argv) {
	if( argc < 5 ) { return NULL; }
	EJ_UNPACK_ARGV(GLenum target, GLenum attachment);
	EJTexture *texture = [EJBindingWebGLTexture textureFromJSValue:argv[2]];
	EJ_UNPACK_ARGV_OFFSET(3, GLint level, GLint layer);
	
	scriptView.currentRenderingContext = renderingContext;
	glFramebufferTextureLayer(target, attachment, texture.textureId, level, layer);
	return NULL;
}

EJ_BIND_FUNCTION(drawBuffers, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }
	
	GLsizei count;
	GLuint *buffers = JSValueToGLuintArray(ctx, argv[0], 1, &count);
	if( !buffers ) { return NULL; }
	
	scriptView.currentRenderingContext = renderingContext;
	
	GLenum attachments[count];
	for( int i = 0; i < count; i++ ) {
		attachments[i] = [self attachmentForBuffer:buffers[i] target:GL_DRAW_FRAMEBUFFER];
	}
	glDrawBuffers(count, attachments);
	return NULL;
}

EJ_BIND_FUNCTION(readBuffer, ctx, argc, argv) {
	EJ_UNPACK_ARGV(GLenum src);
	
	scriptView.currentRenderingContext = renderingContext;
	glReadBuffer([self attachmentForBuffer:src target:GL_READ_FRAMEBUFFER]);
	return NULL;
}

- (void)invalidateFramebufferWithArgc:(size_t)argc argv:(const JSValueRef [])argv ctx:(JSContextRef)ctx
	sub:(BOOL)sub
{
	if( argc < (sub ? 6 : 2) ) { return; }
	
	GLenum target = JSValueToNumberFast(ctx, argv[0]);
	GLsizei count;
	GLuint *buffers = JSValueToGLuintArray(ctx, argv[1], 1, &count);
	if( !buffers ) { return; }
	
	scriptView.currentRenderingContext = renderingContext;
	
	GLenum attachments[count];
	for( int i = 0; i < count; i++ ) {
		attachments[i] = [self attachmentForBuffer:buffers[i] target:target];
	}
	
	if( sub ) {
		glInvalidateSubFramebuffer(target, count, attachments,
			JSValueToNumberFast(ctx, argv[2]), JSValueToNumberFast(ctx, argv[3]),
			JSValueToNumberFast(ctx, argv[4]), JSValueToNumberFast(ctx, argv[5]));
	}
	else {
		glInvalidateFramebuffer(target, count, attachments);
	}
}

EJ_BIND_FUNCTION(invalidateFramebuffer, ctx, argc, argv) {
	[self invalidateFramebufferWithArgc:argc argv:argv ctx:ctx sub:NO];
	return NULL;
}

EJ_BIND_FUNCTION(invalidateSubFramebuffer, ctx, argc, argv) {
	[self invalidateFramebufferWithArgc:argc argv:argv ctx:ctx sub:YES];
	return NULL;
}

// clearBuffer[fv|iv|uiv](buffer, drawbuffer, values, srcOffset)
#define EJ_BIND_CLEAR_BUFFER(NAME, TYPE) \
	EJ_BIND_FUNCTION(clearBuffer##NAME, ctx, argc, argv) { \
		if( argc < 3 ) { return NULL; } \
		GLenum buffer = JSValueToNumberFast(ctx, argv[0]); \
		GLint drawbuffer = JSValueToNumberFast(ctx, argv[1]); \
		GLsizei srcOffset = argc > 3 ? JSValueToNumberFast(ctx, argv[3]) : 0; \
		GLsizei count; \
		TYPE *values = JSValueTo##TYPE##Array(ctx, argv[2], 1, &count); \
		GLsizei needed = (buffer == GL_COLOR) ? 4 : 1; \
		if( !values || srcOffset < 0 || count - srcOffset < needed ) { return NULL; } \
		scriptView.currentRenderingContext = renderingContext; \
		glClearBuffer##NAME(buffer, drawbuffer, values + srcOffset); \
		return NULL; \
	}

EJ_BIND_CLEAR_BUFFER(fv, GLfloat);
EJ_BIND_CLEAR_BUFFER(iv, GLint);
EJ_BIND_CLEAR_BUFFER(uiv, GLuint);

#undef EJ_BIND_CLEAR_BUFFER

EJ_BIND_FUNCTION_DIRECT(clearBufferfi, glClearBufferfi, buffer, drawbuffer, depth, stencil);

EJ_BIND_FUNCTION(getInternalformatParameter, ctx, argc, argv) {
	EJ_UNPACK_ARGV(GLenum target, GLenum internalformat, GLenum pname);
	if( pname != GL_SAMPLES ) { return JSValueMakeNull(ctx); }
	
	scriptView.currentRenderingContext = renderingContext;
	
	GLint count = 0;
	glGetInternalformativ(target, internalformat, GL_NUM_SAMPLE_COUNTS, 1, &count);
	JSObjectRef array = JSObjectMakeTypedArray(ctx, kJSTypedArrayTypeInt32Array, MAX(count, 0), NULL);
	if( count > 0 ) {
		GLint *samples = JSObjectGetTypedArrayBytesPtr(ctx, array, NULL);
		glGetInternalformativ(target, internalformat, GL_SAMPLES, count, samples);
	}
	return array;
}

EJ_BIND_FUNCTION(getFramebufferAttachmentParameter, ctx, argc, argv) {
	if( argc < 3 ) { return NULL; }
	
	scriptView.currentRenderingContext = renderingContext;
	
	GLenum target = JSValueToNumberFast(ctx, argv[0]);
	GLenum attachment = [self attachmentForBuffer:JSValueToNumberFast(ctx, argv[1]) target:target];
	JSValueRef args[] = {argv[0], JSValueMakeNumber(ctx, attachment), argv[2]};
	return [super _func_getFramebufferAttachmentParameter:ctx argc:3 argv:args];
}

EJ_BIND_FUNCTION(readPixels, ctx, argc, argv) {
	// readPixels(x, y, width, height, format, type, dstData, dstOffset)
	// readPixels(x, y, width, height, format, type, offset)
	if( argc < 7 ) { return NULL; }
	EJ_UNPACK_ARGV(GLint x, GLint y, GLsizei width, GLsizei height, GLenum format, GLenum type);
	
	scriptView.currentRenderingContext = renderingContext;
	
	GLint packBuffer;
	glGetIntegerv(GL_PIXEL_PACK_BUFFER_BINDING, &packBuffer);
	
	// Into the pixel pack buffer
	if( JSValueIsNumber(ctx, argv[6]) ) {
		if( !packBuffer ) { return NULL; }
		size_t offset = JSValueToNumberFast(ctx, argv[6]);
		[renderingContext readPixels:^{
			glReadPixels(x, y, width, height, format, type, EJ_BUFFER_OFFSET(offset));
		}];
		return NULL;
	}
	
	if( packBuffer ) { return NULL; }
	
	JSTypedArrayType arrayType = JSValueGetTypedArrayType(ctx, argv[6], NULL);
	GLuint bytesPerPixel = EJGetBytesPerPixel(type, format);
	if( !EJ_ARRAY_MATCHES_TYPE(arrayType, type) || !bytesPerPixel ) { return NULL; }
	
	size_t byteLength = 0;
	GLubyte *data = JSValueGetTypedArrayPtr(ctx, argv[6], &byteLength);
	size_t offset = (argc > 7 ? JSValueToNumberFast(ctx, argv[7]) : 0) * EJTypedArrayElementSize(arrayType);
	if( offset > byteLength ) { return NULL; }
	
	// The bytes OpenGL writes, with the pack state
	GLint alignment, rowLength, skipPixels, skipRows;
	glGetIntegerv(GL_PACK_ALIGNMENT, &alignment);
	glGetIntegerv(GL_PACK_ROW_LENGTH, &rowLength);
	glGetIntegerv(GL_PACK_SKIP_PIXELS, &skipPixels);
	glGetIntegerv(GL_PACK_SKIP_ROWS, &skipRows);
	size_t bytesPerRow = ((rowLength ? rowLength : width) * bytesPerPixel + alignment - 1) / alignment * alignment;
	size_t neededLength = (width && height)
		? (skipRows + height - 1) * bytesPerRow + (skipPixels + width) * bytesPerPixel
		: 0;
	if( byteLength - offset < neededLength ) { return NULL; }
	
	[renderingContext readPixels:^{
		glReadPixels(x, y, width, height, format, type, data + offset);
	}];
	return NULL;
}


// ------------------------------------------------------------------------------------
// Constants

// WebGL 1 has these wrong, for OpenGL ES 2 without a stencil only format
EJ_BIND_CONST_GL(STENCIL_INDEX8);

EJ_BIND_CONST_GL(READ_BUFFER);
EJ_BIND_CONST_GL(UNPACK_ROW_LENGTH);
EJ_BIND_CONST_GL(UNPACK_SKIP_ROWS);
EJ_BIND_CONST_GL(UNPACK_SKIP_PIXELS);
EJ_BIND_CONST_GL(PACK_ROW_LENGTH);
EJ_BIND_CONST_GL(PACK_SKIP_ROWS);
EJ_BIND_CONST_GL(PACK_SKIP_PIXELS);
EJ_BIND_CONST_GL(COLOR);
EJ_BIND_CONST_GL(DEPTH);
EJ_BIND_CONST_GL(STENCIL);
EJ_BIND_CONST_GL(RED);
EJ_BIND_CONST_GL(RGB8);
EJ_BIND_CONST_GL(RGB10_A2);
EJ_BIND_CONST_GL(TEXTURE_BINDING_3D);
EJ_BIND_CONST_GL(UNPACK_SKIP_IMAGES);
EJ_BIND_CONST_GL(UNPACK_IMAGE_HEIGHT);
EJ_BIND_CONST_GL(TEXTURE_3D);
EJ_BIND_CONST_GL(TEXTURE_WRAP_R);
EJ_BIND_CONST_GL(MAX_3D_TEXTURE_SIZE);
EJ_BIND_CONST_GL(UNSIGNED_INT_2_10_10_10_REV);
EJ_BIND_CONST_GL(MAX_ELEMENTS_VERTICES);
EJ_BIND_CONST_GL(MAX_ELEMENTS_INDICES);
EJ_BIND_CONST_GL(TEXTURE_MIN_LOD);
EJ_BIND_CONST_GL(TEXTURE_MAX_LOD);
EJ_BIND_CONST_GL(TEXTURE_BASE_LEVEL);
EJ_BIND_CONST_GL(TEXTURE_MAX_LEVEL);
EJ_BIND_CONST_GL(MIN);
EJ_BIND_CONST_GL(MAX);
EJ_BIND_CONST_GL(DEPTH_COMPONENT24);
EJ_BIND_CONST_GL(MAX_TEXTURE_LOD_BIAS);
EJ_BIND_CONST_GL(TEXTURE_COMPARE_MODE);
EJ_BIND_CONST_GL(TEXTURE_COMPARE_FUNC);
EJ_BIND_CONST_GL(CURRENT_QUERY);
EJ_BIND_CONST_GL(QUERY_RESULT);
EJ_BIND_CONST_GL(QUERY_RESULT_AVAILABLE);
EJ_BIND_CONST_GL(STREAM_READ);
EJ_BIND_CONST_GL(STREAM_COPY);
EJ_BIND_CONST_GL(STATIC_READ);
EJ_BIND_CONST_GL(STATIC_COPY);
EJ_BIND_CONST_GL(DYNAMIC_READ);
EJ_BIND_CONST_GL(DYNAMIC_COPY);
EJ_BIND_CONST_GL(MAX_DRAW_BUFFERS);
EJ_BIND_CONST_GL(DRAW_BUFFER0);
EJ_BIND_CONST_GL(DRAW_BUFFER1);
EJ_BIND_CONST_GL(DRAW_BUFFER2);
EJ_BIND_CONST_GL(DRAW_BUFFER3);
EJ_BIND_CONST_GL(DRAW_BUFFER4);
EJ_BIND_CONST_GL(DRAW_BUFFER5);
EJ_BIND_CONST_GL(DRAW_BUFFER6);
EJ_BIND_CONST_GL(DRAW_BUFFER7);
EJ_BIND_CONST_GL(DRAW_BUFFER8);
EJ_BIND_CONST_GL(DRAW_BUFFER9);
EJ_BIND_CONST_GL(DRAW_BUFFER10);
EJ_BIND_CONST_GL(DRAW_BUFFER11);
EJ_BIND_CONST_GL(DRAW_BUFFER12);
EJ_BIND_CONST_GL(DRAW_BUFFER13);
EJ_BIND_CONST_GL(DRAW_BUFFER14);
EJ_BIND_CONST_GL(DRAW_BUFFER15);
EJ_BIND_CONST_GL(MAX_FRAGMENT_UNIFORM_COMPONENTS);
EJ_BIND_CONST_GL(MAX_VERTEX_UNIFORM_COMPONENTS);
EJ_BIND_CONST_GL(SAMPLER_3D);
EJ_BIND_CONST_GL(SAMPLER_2D_SHADOW);
EJ_BIND_CONST_GL(FRAGMENT_SHADER_DERIVATIVE_HINT);
EJ_BIND_CONST_GL(PIXEL_PACK_BUFFER);
EJ_BIND_CONST_GL(PIXEL_UNPACK_BUFFER);
EJ_BIND_CONST_GL(PIXEL_PACK_BUFFER_BINDING);
EJ_BIND_CONST_GL(PIXEL_UNPACK_BUFFER_BINDING);
EJ_BIND_CONST_GL(SRGB);
EJ_BIND_CONST_GL(SRGB8);
EJ_BIND_CONST_GL(SRGB8_ALPHA8);
EJ_BIND_CONST_GL(COMPARE_REF_TO_TEXTURE);
EJ_BIND_CONST_GL(RGBA32F);
EJ_BIND_CONST_GL(RGB32F);
EJ_BIND_CONST_GL(RGBA16F);
EJ_BIND_CONST_GL(RGB16F);
EJ_BIND_CONST_GL(VERTEX_ATTRIB_ARRAY_INTEGER);
EJ_BIND_CONST_GL(MAX_ARRAY_TEXTURE_LAYERS);
EJ_BIND_CONST_GL(MIN_PROGRAM_TEXEL_OFFSET);
EJ_BIND_CONST_GL(MAX_PROGRAM_TEXEL_OFFSET);
EJ_BIND_CONST_GL(MAX_VARYING_COMPONENTS);
EJ_BIND_CONST_GL(TEXTURE_2D_ARRAY);
EJ_BIND_CONST_GL(TEXTURE_BINDING_2D_ARRAY);
EJ_BIND_CONST_GL(R11F_G11F_B10F);
EJ_BIND_CONST_GL(UNSIGNED_INT_10F_11F_11F_REV);
EJ_BIND_CONST_GL(RGB9_E5);
EJ_BIND_CONST_GL(UNSIGNED_INT_5_9_9_9_REV);
EJ_BIND_CONST_GL(TRANSFORM_FEEDBACK_BUFFER_MODE);
EJ_BIND_CONST_GL(MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS);
EJ_BIND_CONST_GL(TRANSFORM_FEEDBACK_VARYINGS);
EJ_BIND_CONST_GL(TRANSFORM_FEEDBACK_BUFFER_START);
EJ_BIND_CONST_GL(TRANSFORM_FEEDBACK_BUFFER_SIZE);
EJ_BIND_CONST_GL(TRANSFORM_FEEDBACK_PRIMITIVES_WRITTEN);
EJ_BIND_CONST_GL(RASTERIZER_DISCARD);
EJ_BIND_CONST_GL(MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS);
EJ_BIND_CONST_GL(MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS);
EJ_BIND_CONST_GL(INTERLEAVED_ATTRIBS);
EJ_BIND_CONST_GL(SEPARATE_ATTRIBS);
EJ_BIND_CONST_GL(TRANSFORM_FEEDBACK_BUFFER);
EJ_BIND_CONST_GL(TRANSFORM_FEEDBACK_BUFFER_BINDING);
EJ_BIND_CONST_GL(RGBA32UI);
EJ_BIND_CONST_GL(RGB32UI);
EJ_BIND_CONST_GL(RGBA16UI);
EJ_BIND_CONST_GL(RGB16UI);
EJ_BIND_CONST_GL(RGBA8UI);
EJ_BIND_CONST_GL(RGB8UI);
EJ_BIND_CONST_GL(RGBA32I);
EJ_BIND_CONST_GL(RGB32I);
EJ_BIND_CONST_GL(RGBA16I);
EJ_BIND_CONST_GL(RGB16I);
EJ_BIND_CONST_GL(RGBA8I);
EJ_BIND_CONST_GL(RGB8I);
EJ_BIND_CONST_GL(RED_INTEGER);
EJ_BIND_CONST_GL(RGB_INTEGER);
EJ_BIND_CONST_GL(RGBA_INTEGER);
EJ_BIND_CONST_GL(SAMPLER_2D_ARRAY);
EJ_BIND_CONST_GL(SAMPLER_2D_ARRAY_SHADOW);
EJ_BIND_CONST_GL(SAMPLER_CUBE_SHADOW);
EJ_BIND_CONST_GL(UNSIGNED_INT_VEC2);
EJ_BIND_CONST_GL(UNSIGNED_INT_VEC3);
EJ_BIND_CONST_GL(UNSIGNED_INT_VEC4);
EJ_BIND_CONST_GL(INT_SAMPLER_2D);
EJ_BIND_CONST_GL(INT_SAMPLER_3D);
EJ_BIND_CONST_GL(INT_SAMPLER_CUBE);
EJ_BIND_CONST_GL(INT_SAMPLER_2D_ARRAY);
EJ_BIND_CONST_GL(UNSIGNED_INT_SAMPLER_2D);
EJ_BIND_CONST_GL(UNSIGNED_INT_SAMPLER_3D);
EJ_BIND_CONST_GL(UNSIGNED_INT_SAMPLER_CUBE);
EJ_BIND_CONST_GL(UNSIGNED_INT_SAMPLER_2D_ARRAY);
EJ_BIND_CONST_GL(DEPTH_COMPONENT32F);
EJ_BIND_CONST_GL(DEPTH32F_STENCIL8);
EJ_BIND_CONST_GL(FLOAT_32_UNSIGNED_INT_24_8_REV);
EJ_BIND_CONST_GL(FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING);
EJ_BIND_CONST_GL(FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE);
EJ_BIND_CONST_GL(FRAMEBUFFER_ATTACHMENT_RED_SIZE);
EJ_BIND_CONST_GL(FRAMEBUFFER_ATTACHMENT_GREEN_SIZE);
EJ_BIND_CONST_GL(FRAMEBUFFER_ATTACHMENT_BLUE_SIZE);
EJ_BIND_CONST_GL(FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE);
EJ_BIND_CONST_GL(FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE);
EJ_BIND_CONST_GL(FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE);
EJ_BIND_CONST_GL(FRAMEBUFFER_DEFAULT);
EJ_BIND_CONST_GL(UNSIGNED_INT_24_8);
EJ_BIND_CONST_GL(DEPTH24_STENCIL8);
EJ_BIND_CONST_GL(UNSIGNED_NORMALIZED);
EJ_BIND_CONST_GL(DRAW_FRAMEBUFFER_BINDING);
EJ_BIND_CONST_GL(READ_FRAMEBUFFER);
EJ_BIND_CONST_GL(DRAW_FRAMEBUFFER);
EJ_BIND_CONST_GL(READ_FRAMEBUFFER_BINDING);
EJ_BIND_CONST_GL(RENDERBUFFER_SAMPLES);
EJ_BIND_CONST_GL(FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER);
EJ_BIND_CONST_GL(MAX_COLOR_ATTACHMENTS);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT1);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT2);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT3);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT4);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT5);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT6);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT7);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT8);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT9);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT10);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT11);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT12);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT13);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT14);
EJ_BIND_CONST_GL(COLOR_ATTACHMENT15);
EJ_BIND_CONST_GL(FRAMEBUFFER_INCOMPLETE_MULTISAMPLE);
EJ_BIND_CONST_GL(MAX_SAMPLES);
EJ_BIND_CONST_GL(HALF_FLOAT);
EJ_BIND_CONST_GL(RG);
EJ_BIND_CONST_GL(RG_INTEGER);
EJ_BIND_CONST_GL(R8);
EJ_BIND_CONST_GL(RG8);
EJ_BIND_CONST_GL(R16F);
EJ_BIND_CONST_GL(R32F);
EJ_BIND_CONST_GL(RG16F);
EJ_BIND_CONST_GL(RG32F);
EJ_BIND_CONST_GL(R8I);
EJ_BIND_CONST_GL(R8UI);
EJ_BIND_CONST_GL(R16I);
EJ_BIND_CONST_GL(R16UI);
EJ_BIND_CONST_GL(R32I);
EJ_BIND_CONST_GL(R32UI);
EJ_BIND_CONST_GL(RG8I);
EJ_BIND_CONST_GL(RG8UI);
EJ_BIND_CONST_GL(RG16I);
EJ_BIND_CONST_GL(RG16UI);
EJ_BIND_CONST_GL(RG32I);
EJ_BIND_CONST_GL(RG32UI);
EJ_BIND_CONST_GL(VERTEX_ARRAY_BINDING);
EJ_BIND_CONST_GL(R8_SNORM);
EJ_BIND_CONST_GL(RG8_SNORM);
EJ_BIND_CONST_GL(RGB8_SNORM);
EJ_BIND_CONST_GL(RGBA8_SNORM);
EJ_BIND_CONST_GL(SIGNED_NORMALIZED);
EJ_BIND_CONST_GL(COPY_READ_BUFFER);
EJ_BIND_CONST_GL(COPY_WRITE_BUFFER);
EJ_BIND_CONST_GL(COPY_READ_BUFFER_BINDING);
EJ_BIND_CONST_GL(COPY_WRITE_BUFFER_BINDING);
EJ_BIND_CONST_GL(UNIFORM_BUFFER);
EJ_BIND_CONST_GL(UNIFORM_BUFFER_BINDING);
EJ_BIND_CONST_GL(UNIFORM_BUFFER_START);
EJ_BIND_CONST_GL(UNIFORM_BUFFER_SIZE);
EJ_BIND_CONST_GL(MAX_VERTEX_UNIFORM_BLOCKS);
EJ_BIND_CONST_GL(MAX_FRAGMENT_UNIFORM_BLOCKS);
EJ_BIND_CONST_GL(MAX_COMBINED_UNIFORM_BLOCKS);
EJ_BIND_CONST_GL(MAX_UNIFORM_BUFFER_BINDINGS);
EJ_BIND_CONST_GL(MAX_UNIFORM_BLOCK_SIZE);
EJ_BIND_CONST_GL(MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS);
EJ_BIND_CONST_GL(MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS);
EJ_BIND_CONST_GL(UNIFORM_BUFFER_OFFSET_ALIGNMENT);
EJ_BIND_CONST_GL(ACTIVE_UNIFORM_BLOCKS);
EJ_BIND_CONST_GL(UNIFORM_TYPE);
EJ_BIND_CONST_GL(UNIFORM_SIZE);
EJ_BIND_CONST_GL(UNIFORM_BLOCK_INDEX);
EJ_BIND_CONST_GL(UNIFORM_OFFSET);
EJ_BIND_CONST_GL(UNIFORM_ARRAY_STRIDE);
EJ_BIND_CONST_GL(UNIFORM_MATRIX_STRIDE);
EJ_BIND_CONST_GL(UNIFORM_IS_ROW_MAJOR);
EJ_BIND_CONST_GL(UNIFORM_BLOCK_BINDING);
EJ_BIND_CONST_GL(UNIFORM_BLOCK_DATA_SIZE);
EJ_BIND_CONST_GL(UNIFORM_BLOCK_ACTIVE_UNIFORMS);
EJ_BIND_CONST_GL(UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES);
EJ_BIND_CONST_GL(UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER);
EJ_BIND_CONST_GL(UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER);
EJ_BIND_CONST_GL(INVALID_INDEX);
EJ_BIND_CONST_GL(MAX_VERTEX_OUTPUT_COMPONENTS);
EJ_BIND_CONST_GL(MAX_FRAGMENT_INPUT_COMPONENTS);
EJ_BIND_CONST_GL(MAX_SERVER_WAIT_TIMEOUT);
EJ_BIND_CONST_GL(OBJECT_TYPE);
EJ_BIND_CONST_GL(SYNC_CONDITION);
EJ_BIND_CONST_GL(SYNC_STATUS);
EJ_BIND_CONST_GL(SYNC_FLAGS);
EJ_BIND_CONST_GL(SYNC_FENCE);
EJ_BIND_CONST_GL(SYNC_GPU_COMMANDS_COMPLETE);
EJ_BIND_CONST_GL(UNSIGNALED);
EJ_BIND_CONST_GL(SIGNALED);
EJ_BIND_CONST_GL(ALREADY_SIGNALED);
EJ_BIND_CONST_GL(TIMEOUT_EXPIRED);
EJ_BIND_CONST_GL(CONDITION_SATISFIED);
EJ_BIND_CONST_GL(WAIT_FAILED);
EJ_BIND_CONST_GL(SYNC_FLUSH_COMMANDS_BIT);
EJ_BIND_CONST_GL(VERTEX_ATTRIB_ARRAY_DIVISOR);
EJ_BIND_CONST_GL(ANY_SAMPLES_PASSED);
EJ_BIND_CONST_GL(ANY_SAMPLES_PASSED_CONSERVATIVE);
EJ_BIND_CONST_GL(SAMPLER_BINDING);
EJ_BIND_CONST_GL(RGB10_A2UI);
EJ_BIND_CONST_GL(INT_2_10_10_10_REV);
EJ_BIND_CONST_GL(TRANSFORM_FEEDBACK);
EJ_BIND_CONST_GL(TRANSFORM_FEEDBACK_PAUSED);
EJ_BIND_CONST_GL(TRANSFORM_FEEDBACK_ACTIVE);
EJ_BIND_CONST_GL(TRANSFORM_FEEDBACK_BINDING);
EJ_BIND_CONST_GL(TEXTURE_IMMUTABLE_FORMAT);
EJ_BIND_CONST_GL(MAX_ELEMENT_INDEX);
EJ_BIND_CONST_GL(TEXTURE_IMMUTABLE_LEVELS);
EJ_BIND_CONST(TIMEOUT_IGNORED, -1);
EJ_BIND_CONST(MAX_CLIENT_WAIT_TIMEOUT_WEBGL, 0x9247);

@end
