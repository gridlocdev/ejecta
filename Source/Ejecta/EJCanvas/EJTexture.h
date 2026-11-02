// The Texture class is used for everything that provides pixel data in some way
// and should be drawable to a Context. The most obvious use case is as the
// pixel data of an Image element. However, Canvas elements themselfs may need
// to be drawn to other Canvases and thus create a Texture of their contents on
// the fly.

// EJTexture is also extensively used in 2D Contexts for Fonts, Gradients,
// Patterns and ImageData.

// A lot of work goes into making sure that Textures can be shared between
// different 2D and WebGL contexts and keeping track of mutability. The actual
// Texture Data is held in a separate EJTextureStorage class, so that 2D and
// WebGL textures can share the same data, but have different binding
// attributes. This also allows us to release and reload the texture's pixel
// data on demand while keeping the Texture itself around.

// Canvas2D draws with Metal, WebGL with OpenGL ES. Each texture lives in one
// of them and is copied into the other when that one asks for it:
//  - Images, ImageData, fonts, gradients and 2D canvases are Metal textures.
//    When WebGL uses one, an OpenGL copy is made from its pixels.
//  - WebGL textures are OpenGL textures; Canvas2D never draws those.
//  - An offscreen WebGL canvas renders into an IOSurface that is both an
//    OpenGL and a Metal texture, so drawing it into a 2D canvas copies
//    nothing. Metal waits for OpenGL with glFlush; the WebGL context waits
//    for Metal to finish reading before it draws into it again.

// All textures are represented with premultiplied alpha in memory. However,
// ImageData objects for 2D Canvases expect the raw pixel data to be
// unpremultiplied, so this class provides some static methods to premultiply
// and unpremultiply raw pixel data.

#import <UIKit/UIKit.h>
#import <OpenGLES/EAGL.h>
#import <OpenGLES/ES3/gl.h>
#import <OpenGLES/ES3/glext.h>
#import <Metal/Metal.h>
#import <CoreVideo/CoreVideo.h>

#import "EJTextureStorage.h"

@interface EJTexture : NSObject <NSCopying> {
	BOOL cached;
	BOOL drawFlippedY;
	BOOL isCompressed;
	BOOL lazyLoaded;
	BOOL dimensionsKnown;
	short width, height;
	NSString *fullPath;
	EJTextureStorage *textureStorage;
	GLenum format;
	GLuint fbo;
	
	EJTextureParams params;
	NSBlockOperation *loadCallback;
	
	BOOL forWebGL;
	BOOL isMetalRenderTarget;
	BOOL isGLRenderTarget;
	id<MTLTexture> metalTexture;
	NSTimeInterval metalLastUsed;
	
	// IOSurface shared by OpenGL and Metal, for offscreen WebGL canvases
	CVPixelBufferRef interopPixelBuffer;
	CVOpenGLESTextureCacheRef interopGLCache;
	CVOpenGLESTextureRef interopGLTexture;
	CVMetalTextureRef interopMetalTexture;
	id<MTLCommandBuffer> metalReader;
}
- (id)initEmptyForWebGL;
- (id)initWithPath:(NSString *)path;
+ (id)cachedTextureWithPath:(NSString *)path loadOnQueue:(NSOperationQueue *)queue callback:(NSOperation *)callback;
- (id)initWithPath:(NSString *)path loadOnQueue:(NSOperationQueue *)queue callback:(NSOperation *)callback;

- (id)initWithWidth:(int)widthp height:(int)heightp;
- (id)initWithWidth:(int)widthp height:(int)heightp format:(GLenum) format;
- (id)initWithWidth:(int)widthp height:(int)heightp pixels:(NSData *)pixels;
- (id)initAsRenderTargetWithWidth:(int)widthp height:(int)heightp fbo:(GLuint)fbo;
- (id)initWithUIImage:(UIImage *)image;

// The pixels of a 2D canvas: a Metal texture it renders into
- (id)initAsMetalRenderTargetWithWidth:(int)widthp height:(int)heightp;
// Wraps a Metal texture, e.g. a copy of a canvas
- (id)initWithMetalTexture:(id<MTLTexture>)texture;
// The pixels of an offscreen WebGL canvas: OpenGL renders, Metal samples.
// Made with the WebGL context that renders into it current.
- (id)initAsInteropRenderTargetWithWidth:(int)widthp height:(int)heightp;
@property (readonly, nonatomic) BOOL isInterop;

// Called by Canvas2D when it draws with this texture, and by WebGL before it
// renders into it again
- (void)markMetalRead:(id<MTLCommandBuffer>)commandBuffer;
- (void)waitForMetalReads;

- (void)maybeReleaseMetalStorage;

- (void)maybeReleaseStorage;

- (void)ensureMutableKeepPixels:(BOOL)keepPixels forTarget:(GLenum)target;

- (void)createWithTexture:(EJTexture *)other;
- (void)createWithPixels:(NSData *)pixels format:(GLenum)format;
- (void)createWithPixels:(NSData *)pixels format:(GLenum)formatp target:(GLenum)target;
- (void)uploadCompressedPixels:(NSData *)pixels target:(GLenum)target;
- (void)updateWithPixels:(NSData *)pixels atX:(int)x y:(int)y width:(int)subWidth height:(int)subHeight;

- (NSMutableData *)loadPixelsFromPath:(NSString *)path;
- (NSMutableData *)loadPixelsFromUIImage:(UIImage *)image;

- (GLint)getParam:(GLenum)pname;
- (void)setParam:(GLenum)pname param:(GLenum)param;

- (void)bindWithFilter:(GLenum)filter;
- (void)bindToTarget:(GLenum)target;

- (UIImage *)image;
+ (UIImage *)imageWithPixels:(NSData *)pixels width:(int)width height:(int)height;

+ (void)premultiplyPixels:(const GLubyte *)inPixels to:(GLubyte *)outPixels byteLength:(int)byteLength format:(GLenum)format;
+ (void)unPremultiplyPixels:(const GLubyte *)inPixels to:(GLubyte *)outPixels byteLength:(int)byteLength format:(GLenum)format;
+ (void)flipPixelsY:(GLubyte *)pixels bytesPerRow:(int)bytesPerRow rows:(int)rows;

@property (readwrite, nonatomic) BOOL drawFlippedY;
@property (readonly, nonatomic) BOOL isDynamic;
@property (readonly, nonatomic) BOOL lazyLoaded;
@property (readonly, nonatomic) NSMutableData *pixels;
@property (readonly, nonatomic) GLuint textureId;
@property (readonly, nonatomic) id<MTLTexture> metalTexture;
@property (readonly, nonatomic) BOOL isLoaded;
@property (readonly, nonatomic) GLenum format;
@property (readonly, nonatomic) short width, height;
@property (readonly, nonatomic) NSTimeInterval lastUsed;

@end
