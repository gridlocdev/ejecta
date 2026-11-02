// This files hosts various WebGL extensions that can be directly mapped to
// OpenGL extensions provided by iOS.

// To register an extension, it must be inserted into the EJWebGLExtensions
// array.

#import <Foundation/Foundation.h>
#import "EJBindingBase.h"
#import "EJBindingWebGLObjects.h"

#define EJ_WEBGL_1 1
#define EJ_WEBGL_2 2

typedef struct {
	const char *exposedName;
	const char *internalName; // NULL when core in OpenGL ES 3
	int versions; // EJ_WEBGL_1 and/or EJ_WEBGL_2
} EJWebGLExtensionName;

extern const EJWebGLExtensionName EJWebGLExtensions[];
extern const int EJWebGLExtensionsCount;

// Whether the extension is offered to a WebGL context of this version
BOOL EJWebGLExtensionIsAvailable(const EJWebGLExtensionName *extension, int webglVersion);


@interface EJBindingWebGLExtension : EJBindingBase {
	 EJBindingCanvasContextWebGL *webglContext;
}

- (id)initWithWebGLContext:(EJBindingCanvasContextWebGL *)webglContext;

+ (JSObjectRef)createJSObjectWithContext:(JSContextRef)ctx
	scriptView:(EJJavaScriptView *)view
	webglContext:(EJBindingCanvasContextWebGL *)webglContext;

@end


@interface EJBindingWebGLExtensionEXT_texture_filter_anisotropic : EJBindingWebGLExtension
@end;

@interface EJBindingWebGLExtensionOES_texture_float : EJBindingWebGLExtension
@end;

@interface EJBindingWebGLExtensionOES_texture_half_float : EJBindingWebGLExtension
@end;

@interface EJBindingWebGLExtensionOES_texture_half_float_linear : EJBindingWebGLExtension
@end;

@interface EJBindingWebGLExtensionOES_standard_derivatives : EJBindingWebGLExtension
@end;

@interface EJBindingWebGLExtensionOES_vertex_array_object : EJBindingWebGLExtension
@end;

@interface EJBindingWebGLExtensionANGLE_instanced_arrays : EJBindingWebGLExtension
@end;

@interface EJBindingWebGLExtensionEXT_color_buffer_half_float : EJBindingWebGLExtension
@end;

@interface EJBindingWebGLExtensionOES_element_index_uint : EJBindingWebGLExtension
@end;

