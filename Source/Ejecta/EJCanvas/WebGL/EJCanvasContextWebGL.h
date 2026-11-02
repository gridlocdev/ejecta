// The CanvasContextWebGL mainly deals with the default render- and framebuffer
// for WebGL. Most of the WebGL implementation can be found in the
// EJBindingCanvasContextWebGL class.

#import "EJCanvasContext.h"

#define EJ_WEBGL_DEFAULT_FRAMEBUFFER -1
#define EJ_WEBGL_DEFAULT_RENDERBUFFER -1

@class EJJavaScriptView;
@interface EJCanvasContextWebGL : EJCanvasContext {
	GLuint viewFrameBuffer, viewRenderBuffer;
	GLuint msaaFrameBuffer, msaaRenderBuffer;
	GLuint boundReadFrameBuffer, boundDrawFrameBuffer, boundRenderBuffer;
	GLuint depthStencilBuffer;
	
	GLint bufferWidth, bufferHeight;
	EJJavaScriptView *scriptView;
}

- (id)initWithScriptView:(EJJavaScriptView *)scriptView width:(short)width height:(short)height;
- (void)resizeAuxiliaryBuffers;
- (void)bindFramebuffer:(GLint)framebuffer toTarget:(GLuint)target;
- (void)bindRenderbuffer:(GLint)renderbuffer toTarget:(GLuint)target;

// Copies the MSAA buffer into the view's buffer; the bindings stay as they are
- (void)resolveMultisample;

// Calls read with the canvas's pixels readable, if it's the bound read
// framebuffer: its MSAA buffer can't be read from
- (void)readPixels:(void (^)(void))read;

// Whether the canvas's own framebuffer is bound to target
- (BOOL)defaultFramebufferIsBound:(GLenum)target;
- (void)create;
- (void)prepare;
- (void)clear;

@property (nonatomic) BOOL needsPresenting;

@end
