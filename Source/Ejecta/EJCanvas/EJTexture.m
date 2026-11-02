#import <QuartzCore/QuartzCore.h>
#import <OpenGLES/EAGLDrawable.h>
#import "EJTexture.h"
#import "EJConvertWebGL.h"

#import "EJSharedTextureCache.h"
#import "EJSharedOpenGLContext.h"
#import "EJSharedMetalContext.h"
#import "EJJavaScriptView.h"

#define PVR_TEXTURE_FLAG_TYPE_MASK 0xff

enum {
	kPVRTextureFlagTypePVRTC_2 = 24,
	kPVRTextureFlagTypePVRTC_4
};

typedef struct {
	uint32_t headerLength;
	uint32_t height;
	uint32_t width;
	uint32_t numMipmaps;
	uint32_t flags;
	uint32_t dataLength;
	uint32_t bpp;
	uint32_t bitmaskRed;
	uint32_t bitmaskGreen;
	uint32_t bitmaskBlue;
	uint32_t bitmaskAlpha;
	uint32_t pvrTag;
	uint32_t numSurfs;
} PVRTextureHeader;

@interface EJTexture ()
- (void)releaseInterop;
- (void)ensureLoaded;
- (EJTextureStorage *)glStorage;
- (void)createMetalTextureWithPixels:(NSData *)pixels;
- (void)uploadCompressedMetalPixels:(NSData *)pixels;
- (void)createGLStorageWithPixels:(NSData *)pixels target:(GLenum)target;
@end

@implementation EJTexture
@synthesize format;
@synthesize drawFlippedY;

@synthesize lazyLoaded;

- (id)initEmptyForWebGL {
	// For WebGL textures; this will not create a textureStorage
	
	if( self = [super init] ) {
		forWebGL = YES;
		params[kEJTextureParamMinFilter] = GL_LINEAR;
		params[kEJTextureParamMagFilter] = GL_LINEAR;
		params[kEJTextureParamWrapS] = GL_REPEAT;
		params[kEJTextureParamWrapT] = GL_REPEAT;
	}
	return self;
}

- (id)initWithPath:(NSString *)path {
	// For loading on the main thread (blocking)
	
	if( self = [super init] ) {
		fullPath = [path retain];
		
		NSMutableData *pixels = [self loadPixelsFromPath:path];
		if( pixels ) {
			[self createWithPixels:pixels format:GL_RGBA];
		}
	}

	return self;
}

+ (id)cachedTextureWithPath:(NSString *)path loadOnQueue:(NSOperationQueue *)queue callback:(NSOperation *)callback {
	// For loading on a background thread (non-blocking), but tries the cache first
	
	// Only try the cache if path is not a data URI
	BOOL isDataURI = [path hasPrefix:@"data:"];
	
	EJTexture *texture = !isDataURI
		? EJSharedTextureCache.instance.textures[path]
		: nil;
	
	if( texture ) {
		// We already have a texture, but it may hasn't finished loading yet. If
		// the texture's loadCallback is still present, add it as an dependency
		// for the current callback.
		
		if( texture->loadCallback ) {
			[callback addDependency:texture->loadCallback];
		}
		[NSOperationQueue.mainQueue addOperation:callback];
	}
	else {
		// Create a new texture and add it to the cache
		texture = [[EJTexture alloc] initWithPath:path loadOnQueue:queue callback:callback];
		
		if( !isDataURI ) {
			EJSharedTextureCache.instance.textures[path] = texture;
			texture->cached = true;
		}
		[texture autorelease];
	}
	return texture;
}

- (id)initWithPath:(NSString *)path loadOnQueue:(NSOperationQueue *)queue callback:(NSOperation *)callback {
	// For loading on a background thread (non-blocking)
	// This will defer loading for local images
	
	if( self = [super init] ) {
		fullPath = [path retain];
		
		BOOL isURL = [path hasPrefix:@"http:"] || [path hasPrefix:@"https:"];
		BOOL isDataURI = !isURL && [path hasPrefix:@"data:"];
		
		// Neither a URL nor a data URI? We can lazy load the texture. Just add the callback
		// to the load queue and return
		if( !isURL && !isDataURI ) {
			// Only set the lazy loading flag if the file exists, so we know it can, at least potentially,
			// be loaded
			lazyLoaded = [NSFileManager.defaultManager fileExistsAtPath:fullPath];
			format = GL_RGBA;
			[NSOperationQueue.mainQueue addOperation:callback];
			return self;
		}
		
		
		loadCallback = [NSBlockOperation new];
		
		// Load the image file in a background thread
		[queue addOperationWithBlock:^{
			NSMutableData *pixels = [self loadPixelsFromPath:path];
			
			// Upload the pixel data in the main thread, otherwise the GLContext gets confused.	
			// We could use a sharegroup here, but it turned out quite buggy and has little
			// benefits - the main bottleneck is loading the image file.
			[loadCallback addExecutionBlock:^{
				if( pixels ) {
					[self createWithPixels:pixels format:GL_RGBA];
				}
				[loadCallback release];
				loadCallback = nil;
			}];
			[callback addDependency:loadCallback];
			
			[NSOperationQueue.mainQueue addOperation:loadCallback];
			[NSOperationQueue.mainQueue addOperation:callback];
		}];
	}
	return self;
}

- (id)initWithWidth:(int)widthp height:(int)heightp {
	// Create an empty RGBA texture
	return [self initWithWidth:widthp height:heightp format:GL_RGBA];
}

- (id)initWithWidth:(int)widthp height:(int)heightp format:(GLenum)formatp {
	// Create an empty texture
	
	if( self = [super init] ) {
		width = widthp;
		height = heightp;
		dimensionsKnown = true;
		[self createWithPixels:NULL format:formatp];
	}
	return self;
}

- (id)initWithWidth:(int)widthp height:(int)heightp pixels:(NSData *)pixels {
	// Creates a texture with the given pixels
	
	if( self = [super init] ) {
		width = widthp;
		height = heightp;
		dimensionsKnown = true;
		[self createWithPixels:pixels format:GL_RGBA];
	}
	return self;
}

- (id)initAsRenderTargetWithWidth:(int)widthp height:(int)heightp fbo:(GLuint)fbop {
	// An OpenGL texture attached to a framebuffer
	if( self = [super init] ) {
		forWebGL = YES;
		width = widthp;
		height = heightp;
		dimensionsKnown = true;
		fbo = fbop;
		[self createWithPixels:NULL format:GL_RGBA];
	}
	return self;
}

- (id)initAsMetalRenderTargetWithWidth:(int)widthp height:(int)heightp {
	if( self = [super init] ) {
		width = widthp;
		height = heightp;
		dimensionsKnown = true;
		format = GL_RGBA;
		isMetalRenderTarget = YES;
		metalTexture = [EJSharedMetalContext.instance newTextureWithWidth:width height:height
			format:EJ_METAL_PIXEL_FORMAT usage:MTLTextureUsageShaderRead | MTLTextureUsageRenderTarget
			storage:MTLStorageModePrivate sampleCount:1];
	}
	return self;
}

- (id)initWithMetalTexture:(id<MTLTexture>)texture {
	if( self = [super init] ) {
		width = texture.width;
		height = texture.height;
		dimensionsKnown = true;
		format = GL_RGBA;
		metalTexture = [texture retain];
	}
	return self;
}

- (id)initAsInteropRenderTargetWithWidth:(int)widthp height:(int)heightp {
	if( self = [super init] ) {
		forWebGL = YES;
		width = widthp;
		height = heightp;
		dimensionsKnown = true;
		format = GL_RGBA;
		params[kEJTextureParamMinFilter] = GL_LINEAR;
		params[kEJTextureParamMagFilter] = GL_LINEAR;
		params[kEJTextureParamWrapS] = GL_CLAMP_TO_EDGE;
		params[kEJTextureParamWrapT] = GL_CLAMP_TO_EDGE;
		
		// The texture cache may bind the new texture; keep WebGL's binding
		GLint boundTexture = 0;
		glGetIntegerv(GL_TEXTURE_BINDING_2D, &boundTexture);
		
		NSDictionary *attributes = @{
			(id)kCVPixelBufferIOSurfacePropertiesKey: @{},
			(id)kCVPixelBufferOpenGLESCompatibilityKey: @YES,
			(id)kCVPixelBufferMetalCompatibilityKey: @YES
		};
		CVReturn result = CVPixelBufferCreate(kCFAllocatorDefault, MAX(width, 1), MAX(height, 1),
			kCVPixelFormatType_32BGRA, (CFDictionaryRef)attributes, &interopPixelBuffer);
		
		// The OpenGL texture is made in the context that renders into it
		if( result == kCVReturnSuccess ) {
			result = CVOpenGLESTextureCacheCreate(kCFAllocatorDefault, NULL, EAGLContext.currentContext, NULL, &interopGLCache);
		}
		if( result == kCVReturnSuccess ) {
			result = CVOpenGLESTextureCacheCreateTextureFromImage(kCFAllocatorDefault,
				interopGLCache, interopPixelBuffer, NULL,
				GL_TEXTURE_2D, GL_RGBA, MAX(width, 1), MAX(height, 1), GL_BGRA_EXT, GL_UNSIGNED_BYTE, 0, &interopGLTexture);
		}
		if( result == kCVReturnSuccess ) {
			result = CVMetalTextureCacheCreateTextureFromImage(kCFAllocatorDefault,
				EJSharedMetalContext.instance.textureCache, interopPixelBuffer, NULL,
				MTLPixelFormatBGRA8Unorm, MAX(width, 1), MAX(height, 1), 0, &interopMetalTexture);
		}
		
		if( result == kCVReturnSuccess ) {
			textureStorage = [[EJTextureStorage alloc] initWithExistingTexture:CVOpenGLESTextureGetName(interopGLTexture)];
			[textureStorage bindToTarget:GL_TEXTURE_2D withParams:params];
			metalTexture = [CVMetalTextureGetTexture(interopMetalTexture) retain];
		}
		else {
			// No shared surface: a plain OpenGL texture; drawing it into a 2D
			// canvas then reads its pixels back
			NSLog(@"Warning: Could not share a %dx%d texture between OpenGL and Metal (%d)", width, height, result);
			[self releaseInterop];
			isGLRenderTarget = YES;
			[self createWithPixels:NULL format:GL_RGBA];
		}
		glBindTexture(GL_TEXTURE_2D, boundTexture);
	}
	return self;
}

- (void)releaseInterop {
	if( interopMetalTexture ) {
		CFRelease(interopMetalTexture);
		interopMetalTexture = NULL;
		CVMetalTextureCacheFlush(EJSharedMetalContext.instance.textureCache, 0);
	}
	if( interopGLTexture ) { CFRelease(interopGLTexture); interopGLTexture = NULL; }
	if( interopGLCache ) { CFRelease(interopGLCache); interopGLCache = NULL; }
	if( interopPixelBuffer ) { CVPixelBufferRelease(interopPixelBuffer); interopPixelBuffer = NULL; }
}

- (BOOL)isInterop {
	return !!interopPixelBuffer;
}

- (id)initWithUIImage:(UIImage *)image {
	if( self = [super init] ) {
		NSMutableData *pixels = [self loadPixelsFromUIImage:image];
		if( pixels ) {
			[self createWithPixels:pixels format:GL_RGBA];
		}
	}
	return self;
}

- (void)dealloc {
	if( cached ) {
		[EJSharedTextureCache.instance.textures removeObjectForKey:fullPath];
	}
	[loadCallback release];
	
	[fullPath release];
	[textureStorage release];
	[metalTexture release];
	[metalReader release];
	[self releaseInterop];
	[super dealloc];
}

- (void)maybeReleaseStorage {
	// Releases the OpenGL texture storage if it can be easily reloaded from
	// a local file or made again from the Metal texture
	BOOL copyOfMetal = !forWebGL && metalTexture && !isCompressed;
	if( (lazyLoaded || copyOfMetal) && textureStorage ) {
	
		// Make sure this isnt' the currently bound texture
		GLint boundTexture = 0;
		glGetIntegerv(GL_TEXTURE_BINDING_2D, &boundTexture);
		if( boundTexture != textureStorage.textureId ) {
			[textureStorage release];
			textureStorage = nil;
		}
	}
}

- (void)ensureMutableKeepPixels:(BOOL)keepPixels forTarget:(GLenum)target {

	// If we have a TextureStorage but it's not mutable (i.e. created by Canvas2D) and
	// we're not the only owner of it, we have to create a new TextureStorage.
	// FIXME: If the texture is compressed, we simply ignore this check and use the compressed
	// TextureStorage
	if( textureStorage && textureStorage.immutable && textureStorage.retainCount > 1 && !isCompressed ) {
	
		// Keep pixel data of the old TextureStorage when creating the new?
		if( keepPixels ) {
			NSMutableData *pixels = self.pixels;
			if( pixels ) {
				[self createWithPixels:pixels format:GL_RGBA target:target];
			}
		}
		else {
			[textureStorage release];
			textureStorage = NULL;
		}
	}
	
	if( !textureStorage ) {
		textureStorage = [EJTextureStorage new];
	}
}

- (void)maybeReleaseMetalStorage {
	// Releases the Metal texture of an image that can be reloaded from a file
	if( lazyLoaded && metalTexture && !isMetalRenderTarget ) {
		[metalTexture release];
		metalTexture = nil;
	}
}

- (NSTimeInterval)lastUsed {
	return MAX(textureStorage.lastBound, metalLastUsed);
}

- (BOOL)isLoaded {
	return lazyLoaded || metalTexture || textureStorage;
}

- (BOOL)isDynamic {
	return fbo || isMetalRenderTarget || isGLRenderTarget || interopPixelBuffer;
}

// Loads a lazyLoaded texture into whichever API it lives in
- (void)ensureLoaded {
	if( lazyLoaded && !textureStorage && !metalTexture ) {
		NSMutableData *pixels = [self loadPixelsFromPath:fullPath];
		if( pixels ) {
			[self createWithPixels:pixels format:GL_RGBA];
		}
	}
}

// The OpenGL texture; for a Metal texture, an OpenGL copy is made first
- (EJTextureStorage *)glStorage {
	if( !textureStorage && !forWebGL ) {
		NSMutableData *pixels = self.pixels;
		if( pixels ) {
			[self createGLStorageWithPixels:pixels target:GL_TEXTURE_2D];
		}
	}
	return textureStorage;
}

- (GLuint)textureId {
	return self.glStorage.textureId;
}

- (id<MTLTexture>)metalTexture {
	metalLastUsed = NSProcessInfo.processInfo.systemUptime;
	if( metalTexture || interopPixelBuffer ) {
		return metalTexture;
	}
	
	if( forWebGL ) {
		// An OpenGL texture without a shared surface: copy its current pixels
		NSMutableData *pixels = textureStorage ? self.pixels : nil;
		if( !pixels ) { return nil; }
		id<MTLTexture> copy = [EJSharedMetalContext.instance newTextureWithWidth:width height:height
			format:MTLPixelFormatRGBA8Unorm usage:MTLTextureUsageShaderRead storage:MTLStorageModeShared sampleCount:1];
		[copy replaceRegion:MTLRegionMake2D(0, 0, width, height) mipmapLevel:0 withBytes:pixels.bytes bytesPerRow:width * 4];
		return [copy autorelease];
	}
	
	if( lazyLoaded ) {
		NSMutableData *pixels = [self loadPixelsFromPath:fullPath];
		if( pixels ) {
			[self createMetalTextureWithPixels:pixels];
		}
	}
	return metalTexture;
}

- (void)markMetalRead:(id<MTLCommandBuffer>)commandBuffer {
	if( !interopPixelBuffer || metalReader == commandBuffer ) { return; }
	[metalReader release];
	metalReader = [commandBuffer retain];
}

- (void)waitForMetalReads {
	if( !metalReader ) { return; }
	if( metalReader.status < MTLCommandBufferStatusCommitted ) {
		[EJSharedMetalContext.instance commit];
	}
	[metalReader waitUntilCompleted];
	[metalReader release];
	metalReader = nil;
}

- (short)width {
	if( dimensionsKnown ) {
		return width;
	}
	[self ensureLoaded];
	return width;
}

- (short)height {
	if( dimensionsKnown ) {
		return height;
	}
	[self ensureLoaded];
	return height;
}

- (id)copyWithZone:(NSZone *)zone {
	EJTexture *copy = [[EJTexture allocWithZone:zone] init];
	
	// This retains the textureStorage object and sets the associated properties
	[copy createWithTexture:self];
	
	// Copy texture parameters not handled by createWithTexture
	memcpy(copy->params, params, sizeof(EJTextureParams));
	copy->isCompressed = isCompressed;
	
	if( self.isDynamic && !isCompressed ) {
		// We want a static copy of a canvas
		if( isMetalRenderTarget || interopPixelBuffer ) {
			id<MTLTexture> source = self.metalTexture;
			[copy->metalTexture release];
			copy->metalTexture = source ? [EJSharedMetalContext.instance newCopyOfTexture:source] : nil;
			[copy->textureStorage release];
			copy->textureStorage = nil;
			
			// WebGL waits for this copy before it draws into the surface again
			[self markMetalRead:EJSharedMetalContext.instance.commandBuffer];
		}
		else {
			// An OpenGL texture without a shared surface: a Metal copy of its pixels
			[copy->textureStorage release];
			copy->textureStorage = nil;
			[copy createWithPixels:self.pixels format:format];
		}
		copy->drawFlippedY = drawFlippedY;
	}

	return copy;
}

- (void)createWithTexture:(EJTexture *)other {
	// WebGL needs the OpenGL texture; make it if the other one only has
	// Metal. This loads a lazy image, so take its size after.
	EJTextureStorage *otherStorage = forWebGL ? other.glStorage : other->textureStorage;
	[otherStorage retain];
	[textureStorage release];
	[fullPath release];
	
	format = other->format;
	fullPath = [other->fullPath retain];
	
	width = other->width;
	height = other->height;
	isCompressed = other->isCompressed;
	lazyLoaded = other->lazyLoaded;
	dimensionsKnown = other->dimensionsKnown;
	
	textureStorage = otherStorage;
	if( !forWebGL ) {
		[metalTexture release];
		metalTexture = [other->metalTexture retain];
	}
}

- (void)createWithPixels:(NSData *)pixels format:(GLenum)formatp {
	[self createWithPixels:pixels format:formatp target:GL_TEXTURE_2D];
}

- (void)createWithPixels:(NSData *)pixels format:(GLenum)formatp target:(GLenum)target {
	format = formatp;
	
	// Set the default texture params for Canvas2D
	params[kEJTextureParamMinFilter] = GL_LINEAR;
	params[kEJTextureParamMagFilter] = GL_LINEAR;
	params[kEJTextureParamWrapS] = GL_CLAMP_TO_EDGE;
	params[kEJTextureParamWrapT] = GL_CLAMP_TO_EDGE;
	
	if( forWebGL || target != GL_TEXTURE_2D ) {
		[self createGLStorageWithPixels:pixels target:target];
	}
	else {
		[self createMetalTextureWithPixels:pixels];
	}
}

- (void)createMetalTextureWithPixels:(NSData *)pixels {
	[metalTexture release];
	metalTexture = nil;
	
	EJSharedMetalContext *metal = EJSharedMetalContext.instance;
	int maxTextureSize = [metal.device supportsFamily:MTLGPUFamilyApple3] ? 16384 : 8192;
	if( width > maxTextureSize || height > maxTextureSize ) {
		NSLog(@"Warning: Image %@ larger than the maximum texture size (%d)", fullPath ? fullPath : @"[Dynamic]", maxTextureSize);
		return;
	}
	
	if( isCompressed ) {
		[self uploadCompressedMetalPixels:pixels];
		return;
	}
	
	BOOL alpha = (format == GL_ALPHA);
	int bytesPerPixel = alpha ? 1 : 4;
	metalTexture = [metal newTextureWithWidth:width height:height
		format:(alpha ? MTLPixelFormatA8Unorm : MTLPixelFormatRGBA8Unorm)
		usage:MTLTextureUsageShaderRead storage:MTLStorageModeShared sampleCount:1];
	
	// Empty textures (font atlases) start out transparent
	NSData *bytes = pixels ? pixels : [NSMutableData dataWithLength:MAX(width, 1) * MAX(height, 1) * bytesPerPixel];
	if( width > 0 && height > 0 ) {
		[metalTexture replaceRegion:MTLRegionMake2D(0, 0, width, height) mipmapLevel:0
			withBytes:bytes.bytes bytesPerRow:width * bytesPerPixel];
	}
}

- (void)uploadCompressedMetalPixels:(NSData *)pixels {
	PVRTextureHeader *header = (PVRTextureHeader *)pixels.bytes;
	uint32_t formatFlags = header->flags & PVR_TEXTURE_FLAG_TYPE_MASK;
	uint32_t bpp = (formatFlags == kPVRTextureFlagTypePVRTC_4) ? 4 : 2;
	if( formatFlags != kPVRTextureFlagTypePVRTC_4 && formatFlags != kPVRTextureFlagTypePVRTC_2 ) {
		NSLog(@"Warning: PVRTC Compressed Image %@ neither 2 nor 4 bits per pixel", fullPath);
		return;
	}
	
	MTLTextureDescriptor *td = [MTLTextureDescriptor
		texture2DDescriptorWithPixelFormat:(bpp == 4 ? MTLPixelFormatPVRTC_RGBA_4BPP : MTLPixelFormatPVRTC_RGBA_2BPP)
		width:width height:height mipmapped:NO];
	td.mipmapLevelCount = header->numMipmaps + 1;
	metalTexture = [EJSharedMetalContext.instance.device newTextureWithDescriptor:td];
	if( !metalTexture ) {
		NSLog(@"Warning: PVRTC textures are not supported on this device (%@)", fullPath);
		return;
	}
	
	uint8_t *bytes = ((uint8_t *)pixels.bytes) + header->headerLength;
	int mipWidth = width, mipHeight = height;
	for( int mip = 0; mip < header->numMipmaps+1; mip++ ) {
		uint32_t widthBlocks = MAX(mipWidth / (16/bpp), 2);
		uint32_t heightBlocks = MAX(mipHeight / 4, 2);
		uint32_t size = widthBlocks * heightBlocks * 8;
		
		[metalTexture replaceRegion:MTLRegionMake2D(0, 0, mipWidth, mipHeight) mipmapLevel:mip
			withBytes:bytes bytesPerRow:0];
		bytes += size;
		
		mipWidth = MAX(mipWidth >> 1, 1);
		mipHeight = MAX(mipHeight >> 1, 1);
	}
}

- (void)createGLStorageWithPixels:(NSData *)pixels target:(GLenum)target {
	// Release previous texture if we had one
	if( textureStorage ) {
		[textureStorage release];
		textureStorage = NULL;
	}
	
	GLint maxTextureSize;
	glGetIntegerv(GL_MAX_TEXTURE_SIZE, &maxTextureSize);
	
	if( width > maxTextureSize || height > maxTextureSize ) {
		NSLog(@"Warning: Image %@ larger than MAX_TEXTURE_SIZE (%d)", fullPath ? fullPath : @"[Dynamic]", maxTextureSize);
		return;
	}
	
	GLint boundTexture = 0;
	GLenum bindingName = (target == GL_TEXTURE_2D)
		? GL_TEXTURE_BINDING_2D
		: GL_TEXTURE_BINDING_CUBE_MAP;
	glGetIntegerv(bindingName, &boundTexture);
	
	if( isCompressed ) {
		[self uploadCompressedPixels:pixels target:target];
	}
	else {
		textureStorage = [[EJTextureStorage alloc] initImmutable];
		[textureStorage bindToTarget:target withParams:params];
		glTexImage2D(target, 0, format, width, height, 0, format, GL_UNSIGNED_BYTE, pixels.bytes);
	}
	
	glBindTexture(target, boundTexture);
}

- (void)uploadCompressedPixels:(NSData *)pixels target:(GLenum)target {
	PVRTextureHeader *header = (PVRTextureHeader *) pixels.bytes;
	
    uint32_t formatFlags = header->flags & PVR_TEXTURE_FLAG_TYPE_MASK;
	
	GLenum internalFormat;
	uint32_t bpp;
	
	if( formatFlags == kPVRTextureFlagTypePVRTC_4 ) {
		internalFormat = GL_COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;
		bpp = 4;
	}
	else if( formatFlags == kPVRTextureFlagTypePVRTC_2 ) {
		internalFormat = GL_COMPRESSED_RGBA_PVRTC_2BPPV1_IMG;
		bpp = 2;
	}
	else {
		NSLog(@"Warning: PVRTC Compressed Image %@ neither 2 nor 4 bits per pixel", fullPath);
		return;
	}
	
	
	// Create texture storage
	if( header->numMipmaps > 0 ) {
		params[kEJTextureParamMinFilter] = GL_LINEAR_MIPMAP_LINEAR;
	}
	
	textureStorage = [[EJTextureStorage alloc] initImmutable];
	[textureStorage bindToTarget:target withParams:params];
	
	// Upload all mip levels
	int mipWidth = width,
		mipHeight = height;
	
	
	uint8_t *bytes = ((uint8_t *)pixels.bytes) + header->headerLength;
	
	for( int mip = 0; mip < header->numMipmaps+1; mip++ ) {
		uint32_t widthBlocks = MAX(mipWidth / (16/bpp), 2);
		uint32_t heightBlocks = MAX(mipHeight / 4, 2);
		uint32_t size = widthBlocks * heightBlocks * 8;
		
		glCompressedTexImage2D(GL_TEXTURE_2D, mip, internalFormat, mipWidth, mipHeight, 0, size, bytes);
		bytes += size;

		mipWidth = MAX(mipWidth >> 1, 1);
		mipHeight = MAX(mipHeight >> 1, 1);
	}
}

- (void)updateWithPixels:(NSData *)pixels atX:(int)sx y:(int)sy width:(int)sw height:(int)sh {
	if( metalTexture && !forWebGL ) {
		// Only ever writes parts not drawn yet (new font glyphs), so drawing
		// already queued with this texture is not affected
		int bytesPerPixel = (format == GL_ALPHA) ? 1 : 4;
		[metalTexture replaceRegion:MTLRegionMake2D(sx, sy, sw, sh) mipmapLevel:0
			withBytes:pixels.bytes bytesPerRow:sw * bytesPerPixel];
		return;
	}
	
	int boundTexture = 0;
	glGetIntegerv(GL_TEXTURE_BINDING_2D, &boundTexture);
	
	glBindTexture(GL_TEXTURE_2D, textureStorage.textureId);
	glTexSubImage2D(GL_TEXTURE_2D, 0, sx, sy, sw, sh, format, GL_UNSIGNED_BYTE, pixels.bytes);
	
	glBindTexture(GL_TEXTURE_2D, boundTexture);
}

- (NSMutableData *)pixels {
	if( !forWebGL ) {
		// Metal textures: compressed images come from their file, everything
		// else from the GPU, or from the file if it isn't loaded yet
		if( lazyLoaded && (isCompressed || !metalTexture) ) {
			return [self loadPixelsFromPath:fullPath];
		}
		if( metalTexture && !isCompressed ) {
			return [EJSharedMetalContext.instance readPixelsFromTexture:metalTexture x:0 y:0 width:width height:height];
		}
		if( !textureStorage ) {
			return nil;
		}
	}
	
	GLint boundFrameBuffer;
	GLuint tempFramebuffer;
	glGetIntegerv( GL_FRAMEBUFFER_BINDING, &boundFrameBuffer );
	
	// Attach the texture to a temporary framebuffer and read it with
	// glReadPixels. Not the canvas's own framebuffer, even if it has one:
	// framebuffers belong to one context, and this may run in another
	// (textures are shared by all of them).
	glGenFramebuffers(1, &tempFramebuffer);
	glBindFramebuffer(GL_FRAMEBUFFER, tempFramebuffer);
	glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, textureStorage.textureId, 0);
	
	int size = width * height * EJGetBytesPerPixel(GL_UNSIGNED_BYTE, format);
	NSMutableData *data = [NSMutableData dataWithLength:size];
	glReadPixels(0, 0, width, height, format, GL_UNSIGNED_BYTE, data.mutableBytes);
	
	glBindFramebuffer(GL_FRAMEBUFFER, boundFrameBuffer);
	
	
	glDeleteFramebuffers(1, &tempFramebuffer);
	
	return data;
}

- (NSMutableData *)loadPixelsFromPath:(NSString *)path {
	BOOL isURL = [path hasPrefix:@"http:"] || [path hasPrefix:@"https:"];
	BOOL isDataURI = !isURL && [path hasPrefix:@"data:"];
	
	NSMutableData *pixels;
	if( isDataURI || isURL ) {
		// Load directly from a Data URI string or an URL
		UIImage *tmpImage = [[UIImage alloc] initWithData:
			[NSData dataWithContentsOfURL:[NSURL URLWithString:path]]];
		
		if( !tmpImage ) {
			if( isDataURI ) {
				NSLog(@"Error Loading image from Data URI.");
			}
			if( isURL ) {
				NSLog(@"Error Loading image from URL: %@", path);
			}
			return NULL;
		}
		pixels = [self loadPixelsFromUIImage:tmpImage];
		[tmpImage release];
	}
	
	else if( [path.pathExtension isEqualToString:@"pvr"] ) {
		// Compressed PVRTC? Only load raw data bytes
		pixels = [NSMutableData dataWithContentsOfFile:path];
		if( !pixels ) {
			NSLog(@"Error Loading image %@ - not found.", path);
			return NULL;
		}
		PVRTextureHeader *header = (PVRTextureHeader *)pixels.bytes;
		width = header->width;
		height = header->height;
		dimensionsKnown = true;
		isCompressed = true;
	}
	
	else {
		// Use UIImage for PNG, JPG and everything else
		UIImage *tmpImage = [[UIImage alloc] initWithContentsOfFile:path];
		
		if( !tmpImage ) {
			NSLog(@"Error Loading image %@ - not found.", path);
			return NULL;
		}
		
		pixels = [self loadPixelsFromUIImage:tmpImage];
		[tmpImage release];
	}
	
	return pixels;
}

- (NSMutableData *)loadPixelsFromUIImage:(UIImage *)image {
	CGImageRef cgImage = image.CGImage;
	
	width = CGImageGetWidth(cgImage);
	height = CGImageGetHeight(cgImage);
	dimensionsKnown = true;
	
	NSMutableData *pixels = [NSMutableData dataWithLength:width*height*4];
	CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
	CGContextRef context = CGBitmapContextCreate(pixels.mutableBytes, width, height, 8, width * 4, colorSpace, kCGImageAlphaPremultipliedLast);
	CGContextDrawImage(context, CGRectMake(0.0, 0.0, (CGFloat)width, (CGFloat)height), cgImage);
	CGContextRelease(context);
	CGColorSpaceRelease(colorSpace);
	
	return pixels;
}

- (GLint)getParam:(GLenum)pname {
	if(pname == GL_TEXTURE_MIN_FILTER) return params[kEJTextureParamMinFilter];
	if(pname == GL_TEXTURE_MAG_FILTER) return params[kEJTextureParamMagFilter];
	if(pname == GL_TEXTURE_WRAP_S) return params[kEJTextureParamWrapS];
	if(pname == GL_TEXTURE_WRAP_T) return params[kEJTextureParamWrapT];
	return 0;
}

- (void)setParam:(GLenum)pname param:(GLenum)param {
	if(pname == GL_TEXTURE_MIN_FILTER) params[kEJTextureParamMinFilter] = param;
	else if(pname == GL_TEXTURE_MAG_FILTER) params[kEJTextureParamMagFilter] = param;
	else if(pname == GL_TEXTURE_WRAP_S) params[kEJTextureParamWrapS] = param;
	else if(pname == GL_TEXTURE_WRAP_T) params[kEJTextureParamWrapT] = param;
}

- (void)bindWithFilter:(GLenum)filter {
	params[kEJTextureParamMinFilter] = filter;
	params[kEJTextureParamMagFilter] = filter;
	[textureStorage bindToTarget:GL_TEXTURE_2D withParams:params];
}

- (void)bindToTarget:(GLenum)target {
	[self.glStorage bindToTarget:target withParams:params];
}

- (UIImage *)image {
	return [EJTexture imageWithPixels:self.pixels width:width height:height];
}

+ (UIImage *)imageWithPixels:(NSData *)pixels width:(int)width height:(int)height {
	UIImage *newImage = nil;
	
	int nrOfColorComponents = 4; // RGBA
	int bitsPerColorComponent = 8;
	BOOL interpolateAndSmoothPixels = NO;
	CGBitmapInfo bitmapInfo = kCGBitmapByteOrder32Big | kCGImageAlphaPremultipliedLast;
	CGColorRenderingIntent renderingIntent = kCGRenderingIntentDefault;

	CGDataProviderRef dataProviderRef;
	CGColorSpaceRef colorSpaceRef;
	CGImageRef imageRef;

	@try {
		dataProviderRef = CGDataProviderCreateWithData(NULL, pixels.bytes, pixels.length, nil);
		colorSpaceRef = CGColorSpaceCreateDeviceRGB();
		imageRef = CGImageCreate(
			width, height,
			bitsPerColorComponent, bitsPerColorComponent * nrOfColorComponents, width * nrOfColorComponents,
			colorSpaceRef, bitmapInfo, dataProviderRef, NULL, interpolateAndSmoothPixels, renderingIntent
		);
		newImage = [[UIImage alloc] initWithCGImage:imageRef scale:1.0 orientation:UIImageOrientationUp];
	}
	@finally {
		CGDataProviderRelease(dataProviderRef);
		CGColorSpaceRelease(colorSpaceRef);
		CGImageRelease(imageRef);
	}

	return newImage;
}

+ (void)premultiplyPixels:(const GLubyte *)inPixels to:(GLubyte *)outPixels byteLength:(int)byteLength format:(GLenum)format {
	const GLubyte *premultiplyTable = EJSharedTextureCache.instance.premultiplyTable.bytes;
	
	if( format == GL_RGBA ) {
		for( int i = 0; i < byteLength; i += 4 ) {
			unsigned short a = inPixels[i+3] * 256;
			outPixels[i+0] = premultiplyTable[ a + inPixels[i+0] ];
			outPixels[i+1] = premultiplyTable[ a + inPixels[i+1] ];
			outPixels[i+2] = premultiplyTable[ a + inPixels[i+2] ];
			outPixels[i+3] = inPixels[i+3];
		}
	}
	else if ( format == GL_LUMINANCE_ALPHA ) {		
		for( int i = 0; i < byteLength; i += 2 ) {
			unsigned short a = inPixels[i+1] * 256;
			outPixels[i+0] = premultiplyTable[ a + inPixels[i+0] ];
			outPixels[i+1] = inPixels[i+1];
		}
	}
}

+ (void)unPremultiplyPixels:(const GLubyte *)inPixels to:(GLubyte *)outPixels byteLength:(int)byteLength format:(GLenum)format {
	const GLubyte *unPremultiplyTable = EJSharedTextureCache.instance.unPremultiplyTable.bytes;
	
	if( format == GL_RGBA ) {
		for( int i = 0; i < byteLength; i += 4 ) {
			unsigned short a = inPixels[i+3] * 256;
			outPixels[i+0] = unPremultiplyTable[ a + inPixels[i+0] ];
			outPixels[i+1] = unPremultiplyTable[ a + inPixels[i+1] ];
			outPixels[i+2] = unPremultiplyTable[ a + inPixels[i+2] ];
			outPixels[i+3] = inPixels[i+3];
		}
	}
	else if ( format == GL_LUMINANCE_ALPHA ) {		
		for( int i = 0; i < byteLength; i += 2 ) {
			unsigned short a = inPixels[i+1] * 256;
			outPixels[i+0] = unPremultiplyTable[ a + inPixels[i+0] ];
			outPixels[i+1] = inPixels[i+1];
		}
	}
}

+ (void)flipPixelsY:(GLubyte *)pixels bytesPerRow:(int)bytesPerRow rows:(int)rows {
	if( !pixels ) { return; }
	
	GLuint middle = rows/2;
	GLuint intsPerRow = bytesPerRow / sizeof(GLuint);
	GLuint remainingBytes = bytesPerRow - intsPerRow * sizeof(GLuint);
	
	for( GLuint rowTop = 0, rowBottom = rows-1; rowTop < middle; rowTop++, rowBottom-- ) {
		
		// Swap bytes in packs of sizeof(GLuint) bytes
		GLuint *iTop = (GLuint *)(pixels + rowTop * bytesPerRow);
		GLuint *iBottom = (GLuint *)(pixels + rowBottom * bytesPerRow);
		
		GLuint itmp;
		GLint n = intsPerRow;
		do {
			itmp = *iTop;
			*iTop++ = *iBottom;
			*iBottom++ = itmp;
		} while(--n > 0);
		
		// Swap the remaining bytes
		GLubyte *bTop = (GLubyte *)iTop;
		GLubyte *bBottom = (GLubyte *)iBottom;
		
		GLubyte btmp;
		switch( remainingBytes ) {
			case 3: btmp = *bTop; *bTop++ = *bBottom; *bBottom++ = btmp;
			case 2: btmp = *bTop; *bTop++ = *bBottom; *bBottom++ = btmp;
			case 1: btmp = *bTop; *bTop = *bBottom; *bBottom = btmp;
		}
	}
}


@end
