// The Shared Metal Context holds everything all Canvas2D contexts draw with:
// the Metal device and command queue, the compiled shaders, cached pipeline,
// depth-stencil and sampler states, and the one command buffer that all 2D
// drawing of a frame is recorded into.

// Only one encoder can be open on a command buffer at a time. A 2D context
// asks for a render encoder when it starts drawing; this ends whatever
// encoder another context had open, and tells that context through
// metalEncoderDidEnd. All encoders go into the same command buffer in order,
// so a canvas drawn into another sees everything drawn into it before.

// The command buffer is committed when the screen canvas presents, at the end
// of each frame, and whenever pixels have to come back to the CPU
// (getImageData, toDataURL, uploading a canvas into WebGL).

#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#import <QuartzCore/QuartzCore.h>
#import <CoreVideo/CoreVideo.h>

#define EJ_METAL_PIXEL_FORMAT MTLPixelFormatBGRA8Unorm
#define EJ_METAL_DEPTH_STENCIL_FORMAT MTLPixelFormatDepth32Float_Stencil8

typedef enum {
	kEJ2DProgramFlat,
	kEJ2DProgramTexture,
	kEJ2DProgramAlphaTexture,
	kEJ2DProgramPattern,
	kEJ2DProgramRadialGradient,
	kEJ2DProgramCount
} EJ2DProgram;

// The depth and stencil state of a 2D context, in the terms OpenGL uses for
// it. Depth testing is always on while a context has a depth-stencil buffer;
// clipping relies on it. Front and back faces can have different stencil
// operations, which the non-zero fill rule uses.
typedef struct {
	MTLCompareFunction depthCompare;
	BOOL depthWrite;
	BOOL stencilTest;
	MTLCompareFunction stencilCompare;
	uint8_t stencilRef, stencilReadMask, stencilWriteMask;
	MTLStencilOperation frontFail, frontDepthFail, frontPass;
	MTLStencilOperation backFail, backDepthFail, backPass;
} EJ2DDepthStencil;

static inline EJ2DDepthStencil EJ2DDepthStencilDefault(void) {
	EJ2DDepthStencil ds;
	ds.depthCompare = MTLCompareFunctionAlways;
	ds.depthWrite = NO;
	ds.stencilTest = NO;
	ds.stencilCompare = MTLCompareFunctionAlways;
	ds.stencilRef = 0;
	ds.stencilReadMask = 0xff;
	ds.stencilWriteMask = 0xff;
	ds.frontFail = ds.frontDepthFail = ds.frontPass = MTLStencilOperationKeep;
	ds.backFail = ds.backDepthFail = ds.backPass = MTLStencilOperationKeep;
	return ds;
}

// Sets the same stencil operations for front and back faces
static inline void EJ2DDepthStencilSetOps( EJ2DDepthStencil *ds, MTLStencilOperation fail, MTLStencilOperation depthFail, MTLStencilOperation pass ) {
	ds->frontFail = ds->backFail = fail;
	ds->frontDepthFail = ds->backDepthFail = depthFail;
	ds->frontPass = ds->backPass = pass;
}

@protocol EJMetalEncoderOwner
- (void)metalEncoderDidEnd;
@end

@interface EJSharedMetalContext : NSObject {
	id<MTLDevice> device;
	id<MTLCommandQueue> queue;
	id<MTLLibrary> library;
	id<MTLFunction> vertexFunction;
	id<MTLFunction> fragmentFunctions[kEJ2DProgramCount];
	MTLVertexDescriptor *vertexDescriptor;

	NSMutableDictionary *pipelines;
	NSMutableDictionary *depthStencilStates;
	id<MTLSamplerState> samplerLinear, samplerNearest;

	id<MTLCommandBuffer> commandBuffer;
	id<MTLCommandEncoder> encoder;
	id<EJMetalEncoderOwner> encoderOwner;

	id<MTLBuffer> arena;
	NSUInteger arenaOffset;
	NSMutableArray *arenasInUse;
	NSMutableArray *freeArenas;

	CVMetalTextureCacheRef textureCache;
	int maxSamples;
}

+ (EJSharedMetalContext *)instance;

- (id<MTLRenderPipelineState>)pipelineForProgram:(EJ2DProgram)program
	blendSource:(MTLBlendFactor)source destination:(MTLBlendFactor)destination
	colorWrite:(BOOL)colorWrite depthStencil:(BOOL)depthStencil sampleCount:(int)sampleCount;
- (id<MTLDepthStencilState>)depthStencilState:(EJ2DDepthStencil)state;
- (id<MTLSamplerState>)samplerNearest:(BOOL)nearest;

// Ends the open encoder, if any, and opens a new one owned by owner
- (id<MTLRenderCommandEncoder>)renderEncoderWithDescriptor:(MTLRenderPassDescriptor *)descriptor
	owner:(id<EJMetalEncoderOwner>)owner;
- (id<MTLBlitCommandEncoder>)blitEncoder;
- (void)endEncoder;
- (void)endEncoderIfOwner:(id)owner;

- (void)commit;
- (void)commitAndWait;

// Copies bytes into a GPU buffer that stays valid until the command buffer
// they are drawn with completes
- (id<MTLBuffer>)bufferWithBytes:(const void *)bytes length:(NSUInteger)length offset:(NSUInteger *)offset;

- (id<MTLTexture>)newTextureWithWidth:(int)width height:(int)height format:(MTLPixelFormat)format
	usage:(MTLTextureUsage)usage storage:(MTLStorageMode)storage sampleCount:(int)sampleCount;
- (id<MTLTexture>)newCopyOfTexture:(id<MTLTexture>)texture;

// Reads pixels back as RGBA (or single bytes for A8 textures). Waits for
// all drawing so far to finish. The region is clipped to the texture; pixels
// outside of it are transparent black.
- (NSMutableData *)readPixelsFromTexture:(id<MTLTexture>)texture x:(int)x y:(int)y width:(int)w height:(int)h;

@property (nonatomic, readonly) id<MTLDevice> device;
@property (nonatomic, readonly) id<MTLCommandBuffer> commandBuffer;
@property (nonatomic, readonly) CVMetalTextureCacheRef textureCache;
@property (nonatomic, readonly) int maxSamples;

@end
