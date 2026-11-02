// The binding for WebGL 2 contexts. It has every WebGL 1 call of
// EJBindingCanvasContextWebGL, and adds the OpenGL ES 3 calls that WebGL 2
// is made of. GLSL ES 3.00 shaders go to OpenGL as they are.

#import "EJBindingCanvasContextWebGL.h"

@interface EJBindingCanvasContextWebGL2 : EJBindingCanvasContextWebGL {
	NSMutableDictionary *samplers;
	NSMutableDictionary *queries;
	NSMutableDictionary *transformFeedbacks;
}

- (void)deleteSampler:(GLuint)sampler;
- (void)deleteQuery:(GLuint)query;
- (void)deleteTransformFeedback:(GLuint)transformFeedback;
- (void)deleteSync:(GLsync)sync;

@end
