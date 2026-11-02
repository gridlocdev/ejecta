#import "EJBindingWebGLExtensions.h"
#import "EJBindingCanvasContextWebGL.h"
#import "EJConvertWebGL.h"


// Extensions with no internal name are core in OpenGL ES 3, which every
// Ejecta GL context uses, so they are always available
const EJWebGLExtensionName EJWebGLExtensions[] = {
	{"EXT_texture_filter_anisotropic", "GL_EXT_texture_filter_anisotropic", EJ_WEBGL_1 | EJ_WEBGL_2},
	{"EXT_color_buffer_half_float", "GL_EXT_color_buffer_half_float", EJ_WEBGL_1 | EJ_WEBGL_2},
	{"OES_texture_float", NULL, EJ_WEBGL_1},
	{"OES_texture_half_float", NULL, EJ_WEBGL_1},
	{"OES_texture_half_float_linear", NULL, EJ_WEBGL_1},
	{"OES_standard_derivatives", "GL_OES_standard_derivatives", EJ_WEBGL_1},
	{"OES_vertex_array_object", NULL, EJ_WEBGL_1},
	{"ANGLE_instanced_arrays", NULL, EJ_WEBGL_1},
	{"OES_element_index_uint", NULL, EJ_WEBGL_1}
};

const int EJWebGLExtensionsCount = sizeof(EJWebGLExtensions) / sizeof(EJWebGLExtensionName);

BOOL EJWebGLExtensionIsAvailable(const EJWebGLExtensionName *extension, int webglVersion) {
	if( !(extension->versions & webglVersion) ) { return NO; }
	if( !extension->internalName ) { return YES; }
	
	const char *allExtensions = (const char *)glGetString(GL_EXTENSIONS);
	return allExtensions && strstr(allExtensions, extension->internalName) != NULL;
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


