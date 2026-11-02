// This class implements the binding for the WebGL Canvas Context as well as a
// good chunk of the actual WebGL implemenation. This differs from all the
// Canvas2D bindings that are strictly separated from their implementation. The
// reasoning here is that you may want to use Canvas2D functions in native code,
// but you'd never want to use WebGL in native code (after all, you can just
// use OpenGL ES directly)

// The binding is mostly concerned with translating function arguments to and
// from JavaScript before handing it over to OpenGL and also does a lot of
// housekeeping on active textures, buffers, shader programs etc.

#import <Foundation/Foundation.h>
#import "EJBindingBase.h"
#import "EJCanvasContextWebGL.h"
#import "EJTexture.h"

#define GL_UNPACK_FLIP_Y_WEBGL 0x9240
#define GL_UNPACK_PREMULTIPLY_ALPHA_WEBGL 0x9241
#define GL_CONTEXT_LOST_WEBGL 0x9242
#define GL_UNPACK_COLORSPACE_CONVERSION_WEBGL 0x9243
#define GL_BROWSER_DEFAULT_WEBGL 0x9244

#define GL_DEPTH_STENCIL_ATTACHMENT 0x821A

#define EJ_CANVAS_MAX_TEXTURE_UNITS 16
#define EJ_BUFFER_OFFSET(i) ((char *)NULL + (i))

#define EJ_BIND_CONST_GL(NAME) EJ_BIND_CONST(NAME, GL_##NAME)

// The targets a texture unit holds a texture for; 3D and 2D array are WebGL 2
typedef enum {
	kEJTextureSlot2D,
	kEJTextureSlotCubeMap,
	kEJTextureSlot3D,
	kEJTextureSlot2DArray,
	kEJTextureSlotCount
} EJTextureSlot;

typedef struct {
	EJTexture *textures[kEJTextureSlotCount];
	JSObjectRef jsTextures[kEJTextureSlotCount];
} EJCanvasContextTextureUnit;

@class EJJavaScriptView;
@interface EJBindingCanvasContextWebGL : EJBindingBase {
	
	BOOL unpackFlipY;
	BOOL premultiplyAlpha;
	
	JSObjectRef jsCanvas;
	EJCanvasContextWebGL *renderingContext;
	
	NSMutableDictionary *renderbuffers;
	NSMutableDictionary *framebuffers;
	NSMutableDictionary *buffers;
	NSMutableDictionary *textures;
	NSMutableDictionary *programs;
	NSMutableDictionary *shaders;
	
    NSMutableDictionary *extensions;
    
    NSMutableDictionary *vertexArrays;
    
	EJCanvasContextTextureUnit textureUnits[EJ_CANVAS_MAX_TEXTURE_UNITS];
	EJCanvasContextTextureUnit *activeTexture;
}

- (id)initWithRenderingContext:(EJCanvasContextWebGL *)renderingContextp;

- (void)deleteRenderbuffer:(GLuint)renderbuffer;
- (void)deleteFramebuffer:(GLuint)framebuffer;
- (void)deleteBuffer:(GLuint)buffer;
- (void)deleteTexture:(GLuint)texture;
- (void)deleteProgram:(GLuint)program;
- (void)deleteShader:(GLuint)shader;

- (void)addVertexArray:(GLuint)vertexArray obj:(JSObjectRef)objp;

// The texture unit slot for a texture bind target, or -1
- (int)textureSlotForTarget:(GLenum)target;

// The bind target for an image target: a cube map face's is the cube map
- (GLenum)bindTargetForImageTarget:(GLenum)target;

// Keeps the textures dictionary current after an upload may have given the
// texture a new OpenGL texture
- (void)updateTexture:(EJTexture *)texture jsTexture:(JSObjectRef)jsTexture
	oldTextureId:(GLint)oldTextureId bindTarget:(GLenum)bindTarget;
- (void)deleteVertexArray:(GLuint)vertexArray;

@property (readonly, nonatomic) EJCanvasContextWebGL *renderingContext;
@property (readonly, nonatomic) int webglVersion; // EJ_WEBGL_1 or EJ_WEBGL_2

@end
