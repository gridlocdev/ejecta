#import "EJBindingWebGLExtensions.h"
#import "EJBindingCanvasContextWebGL.h"
#import "EJConvertWebGL.h"


// Extensions with no internal name are core in OpenGL ES 3, which every
// Ejecta GL context uses, so they are always available
const EJWebGLExtensionName EJWebGLExtensions[] = {
	{"EXT_texture_filter_anisotropic", "GL_EXT_texture_filter_anisotropic", EJ_WEBGL_1 | EJ_WEBGL_2},
	{"EXT_color_buffer_half_float", "GL_EXT_color_buffer_half_float", EJ_WEBGL_1 | EJ_WEBGL_2},
	{"EXT_color_buffer_float", "GL_EXT_color_buffer_float", EJ_WEBGL_2},
	{"OES_texture_float", NULL, EJ_WEBGL_1},
	{"OES_texture_half_float", NULL, EJ_WEBGL_1},
	{"OES_texture_half_float_linear", NULL, EJ_WEBGL_1},
	{"OES_standard_derivatives", "GL_OES_standard_derivatives", EJ_WEBGL_1},
	{"OES_vertex_array_object", NULL, EJ_WEBGL_1},
	{"ANGLE_instanced_arrays", NULL, EJ_WEBGL_1},
	{"OES_element_index_uint", NULL, EJ_WEBGL_1}
};

const int EJWebGLExtensionsCount = sizeof(EJWebGLExtensions) / sizeof(EJWebGLExtensionName);

// Whether the GPU renders to every format EXT_color_buffer_float makes
// renderable, for drivers that can but don't list the extension. It uses
// textures: OpenGL ES 3 accepts every one of these formats for a texture,
// and a texture it can't render to only makes the framebuffer incomplete,
// where a renderbuffer would raise an error the page would see.
static BOOL EJFloatColorBuffersRenderable() {
	static int renderable = -1;
	if( renderable >= 0 ) { return renderable; }
	
	GLint previousFramebuffer, previousTexture;
	glGetIntegerv(GL_FRAMEBUFFER_BINDING, &previousFramebuffer);
	glGetIntegerv(GL_TEXTURE_BINDING_2D, &previousTexture);
	
	GLuint framebuffer;
	glGenFramebuffers(1, &framebuffer);
	glBindFramebuffer(GL_FRAMEBUFFER, framebuffer);
	
	GLenum formats[] = {GL_R16F, GL_RG16F, GL_RGBA16F, GL_R32F, GL_RG32F, GL_RGBA32F, GL_R11F_G11F_B10F};
	renderable = 1;
	for( int i = 0; i < sizeof(formats)/sizeof(formats[0]) && renderable; i++ ) {
		GLuint texture;
		glGenTextures(1, &texture);
		glBindTexture(GL_TEXTURE_2D, texture);
		glTexStorage2D(GL_TEXTURE_2D, 1, formats[i], 4, 4);
		glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texture, 0);
		renderable = glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE;
		glDeleteTextures(1, &texture);
	}
	
	glDeleteFramebuffers(1, &framebuffer);
	glBindFramebuffer(GL_FRAMEBUFFER, previousFramebuffer);
	glBindTexture(GL_TEXTURE_2D, previousTexture);
	return renderable;
}

BOOL EJWebGLExtensionIsAvailable(const EJWebGLExtensionName *extension, int webglVersion) {
	if( !(extension->versions & webglVersion) ) { return NO; }
	if( !extension->internalName ) { return YES; }
	
	const char *allExtensions = (const char *)glGetString(GL_EXTENSIONS);
	if( allExtensions && strstr(allExtensions, extension->internalName) != NULL ) { return YES; }
	
	if( strcmp(extension->exposedName, "EXT_color_buffer_float") == 0 ) {
		return EJFloatColorBuffersRenderable();
	}
	return NO;
}


@implementation EJBindingWebGLExtension

- (id)initWithWebGLContext:(EJBindingCanvasContextWebGL *)webglContextp {
	if( self = [super initWithContext:NULL argc:0 argv:NULL] ) {
		webglContext = [webglContextp retain];
	}
	return self;
}

- (void)dealloc {
	[webglContext release];
	[super dealloc];
}

+ (JSObjectRef)createJSObjectWithContext:(JSContextRef)ctx
	scriptView:(EJJavaScriptView *)view
	webglContext:(EJBindingCanvasContextWebGL *)webglContext
{
	id native = [[self alloc] initWithWebGLContext:webglContext];
	
	JSObjectRef obj = [self createJSObjectWithContext:ctx scriptView:view instance:native];
	[native release];
	return obj;
}

@end


@implementation EJBindingWebGLExtensionEXT_texture_filter_anisotropic
EJ_BIND_CONST_GL(MAX_TEXTURE_MAX_ANISOTROPY_EXT);
EJ_BIND_CONST_GL(TEXTURE_MAX_ANISOTROPY_EXT);
@end


@implementation EJBindingWebGLExtensionOES_texture_float
@end


@implementation EJBindingWebGLExtensionOES_texture_half_float
EJ_BIND_CONST(HALF_FLOAT_OES, GL_HALF_FLOAT_OES);
@end


@implementation EJBindingWebGLExtensionOES_texture_half_float_linear
@end


@implementation EJBindingWebGLExtensionOES_standard_derivatives
EJ_BIND_CONST(FRAGMENT_SHADER_DERIVATIVE_HINT_OES, GL_FRAGMENT_SHADER_DERIVATIVE_HINT);
@end


@implementation EJBindingWebGLExtensionEXT_color_buffer_half_float
EJ_BIND_CONST(RGBA16F_EXT, GL_RGBA16F);
EJ_BIND_CONST(RGB16F_EXT, GL_RGB16F);
EJ_BIND_CONST(FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE_EXT, GL_FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE);
EJ_BIND_CONST(UNSIGNED_NORMALIZED_EXT, GL_UNSIGNED_NORMALIZED);
@end


@implementation EJBindingWebGLExtensionEXT_color_buffer_float
@end


@implementation EJBindingWebGLExtensionOES_vertex_array_object

EJ_BIND_FUNCTION(createVertexArrayOES, ctx, argc, argv) {
	GLuint vertexArray;
	scriptView.currentRenderingContext = webglContext.renderingContext;
	glGenVertexArrays(1, &vertexArray);
	JSObjectRef obj = [EJBindingWebGLVertexArrayObjectOES createJSObjectWithContext:ctx
		scriptView:scriptView webglContext:webglContext index:vertexArray];
	[webglContext addVertexArray:vertexArray obj:obj];
	return obj;
}

EJ_BIND_FUNCTION(deleteVertexArrayOES, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }

	// Invalidate the object, as the other delete calls do, so it forgets its
	// index: GL reuses it for the next vertex array, which this object's
	// finalizer would otherwise delete
	[[EJBindingWebGLVertexArrayObjectOES webGLObjectFromJSValue:argv[0]] invalidate];
	return NULL;
}

EJ_BIND_FUNCTION(isVertexArrayOES, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }

	scriptView.currentRenderingContext = webglContext.renderingContext;
	GLuint index = [EJBindingWebGLVertexArrayObjectOES indexFromJSValue:argv[0]];
	return JSValueMakeBoolean(ctx, glIsVertexArray(index));
}

EJ_BIND_FUNCTION(bindVertexArrayOES, ctx, argc, argv) {
	if( argc < 1 ) { return NULL; }

	scriptView.currentRenderingContext = webglContext.renderingContext;
	GLuint index = [EJBindingWebGLVertexArrayObjectOES indexFromJSValue:argv[0]];
	glBindVertexArray(index);
	return NULL;
}

EJ_BIND_CONST(VERTEX_ARRAY_BINDING_OES, GL_VERTEX_ARRAY_BINDING);

@end



@implementation EJBindingWebGLExtensionANGLE_instanced_arrays

EJ_BIND_FUNCTION(drawArraysInstancedANGLE, ctx, argc, argv) {
	EJ_UNPACK_ARGV(GLenum mode, GLint first, GLsizei count, GLsizei instanceCount);
	glDrawArraysInstanced(mode, first, count, instanceCount);
	return NULL;
}

EJ_BIND_FUNCTION(drawElementsInstancedANGLE, ctx, argc, argv) {
	EJ_UNPACK_ARGV(GLenum mode, GLsizei count, GLenum type, GLint indices, GLsizei instanceCount);
	glDrawElementsInstanced(mode, count, type, EJ_BUFFER_OFFSET(indices), instanceCount);
	return NULL;
}

EJ_BIND_FUNCTION(vertexAttribDivisorANGLE, ctx, argc, argv) {
	EJ_UNPACK_ARGV(GLuint index, GLuint divisor);
	glVertexAttribDivisor(index, divisor);
	return NULL;
}

EJ_BIND_CONST(VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE, GL_VERTEX_ATTRIB_ARRAY_DIVISOR);

@end

@implementation EJBindingWebGLExtensionOES_element_index_uint
@end


