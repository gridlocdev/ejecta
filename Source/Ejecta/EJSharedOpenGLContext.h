// The Shared OpenGL Context holds the EAGL sharegroup all WebGL contexts are
// created in, so textures made by one (and images uploaded for one) can be
// used by all of them. Its own EAGLContext is current whenever no WebGL
// context is, so OpenGL resources can always be created and released.

// Canvas2D does not use OpenGL; it draws with Metal (EJSharedMetalContext).
// The CoreVideo texture cache here gives offscreen WebGL canvases surfaces
// that Metal can read as well.

#import <Foundation/Foundation.h>
#import <OpenGLES/EAGL.h>
#import <OpenGLES/ES2/gl.h>
#import <OpenGLES/ES2/glext.h>
#import <CoreVideo/CoreVideo.h>

@interface EJSharedOpenGLContext : NSObject {
	EAGLContext *glContext2D;
	EAGLSharegroup *glSharegroup;
	CVOpenGLESTextureCacheRef textureCache;
}

+ (EJSharedOpenGLContext *)instance;

@property (nonatomic, readonly) EAGLContext *glContext2D;
@property (nonatomic, readonly) EAGLSharegroup *glSharegroup;
@property (nonatomic, readonly) CVOpenGLESTextureCacheRef textureCache;

@end
