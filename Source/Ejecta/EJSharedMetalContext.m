#import "EJSharedMetalContext.h"
#import "EJCanvas/2D/EJCanvas2DTypes.h"

#define EJ_METAL_ARENA_SIZE (512 * 1024)

// Shaders for all Canvas2D drawing. Compiled when the app starts, so building
// the app does not need Xcode's separately downloaded Metal toolchain.
static NSString * const EJ2DShaderSource = @
	"#include <metal_stdlib>\n"
	"using namespace metal;\n"
	"\n"
	"struct VertexIn {\n"
	"	float2 pos [[attribute(0)]];\n"
	"	float2 uv [[attribute(1)]];\n"
	"	float4 color [[attribute(2)]];\n"
	"};\n"
	"struct VertexOut {\n"
	"	float4 position [[position]];\n"
	"	float2 uv;\n"
	"	float4 color;\n"
	"};\n"
	"\n"
	// screen is (width, -height): canvas pixels to clip space, y down
	"vertex VertexOut ej2d_vertex(VertexIn in [[stage_in]], constant float2 &screen [[buffer(1)]]) {\n"
	"	VertexOut out;\n"
	"	out.position = float4(in.pos * (float2(2.0) / screen) - clamp(screen, -1.0, 1.0), 0.0, 1.0);\n"
	"	out.uv = in.uv;\n"
	"	out.color = in.color;\n"
	"	return out;\n"
	"}\n"
	"\n"
	"fragment float4 ej2d_flat(VertexOut in [[stage_in]]) {\n"
	"	return in.color;\n"
	"}\n"
	"fragment float4 ej2d_texture(VertexOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {\n"
	"	return t.sample(s, in.uv) * in.color;\n"
	"}\n"
	"fragment float4 ej2d_alpha_texture(VertexOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {\n"
	"	return float4(t.sample(s, in.uv).a) * in.color;\n"
	"}\n"
	"fragment float4 ej2d_pattern(VertexOut in [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {\n"
	"	return t.sample(s, fract(in.uv)) * in.color;\n"
	"}\n"
	"\n"
	// inner and diff: x, y and radius of the start circle and the difference to the end circle
	"struct RadialGradient { float4 inner; float4 diff; };\n"
	"fragment float4 ej2d_radial_gradient(VertexOut in [[stage_in]], constant RadialGradient &g [[buffer(0)]],\n"
	"	texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {\n"
	"	float2 p2 = in.uv - g.inner.xy;\n"
	"	float A = dot(g.diff.xy, g.diff.xy) - g.diff.z * g.diff.z;\n"
	"	float B = dot(p2, g.diff.xy) + g.inner.z * g.diff.z;\n"
	"	float C = dot(p2, p2) - g.inner.z * g.inner.z;\n"
	"	float D = B * B - A * C;\n"
	"	float DA = sqrt(max(D, 0.0)) / A;\n"
	"	float BA = B / A;\n"
	"	float tt = max(BA + DA, BA - DA);\n"
	"	float keep = (D >= 0.0 && g.diff.z * tt + g.inner.z > 0.0) ? 1.0 : 0.0;\n"
	"	return t.sample(s, float2(tt, 0.5)) * in.color * keep;\n"
	"}\n";

static NSString * const EJ2DFragmentNames[kEJ2DProgramCount] = {
	[kEJ2DProgramFlat] = @"ej2d_flat",
	[kEJ2DProgramTexture] = @"ej2d_texture",
	[kEJ2DProgramAlphaTexture] = @"ej2d_alpha_texture",
	[kEJ2DProgramPattern] = @"ej2d_pattern",
	[kEJ2DProgramRadialGradient] = @"ej2d_radial_gradient"
};


@implementation EJSharedMetalContext

@synthesize device;
@synthesize textureCache;
@synthesize maxSamples;

static EJSharedMetalContext *sharedMetalContext;
+ (EJSharedMetalContext *)instance {
	if( !sharedMetalContext ) {
		sharedMetalContext = [[EJSharedMetalContext alloc] init];
	}
	return sharedMetalContext;
}

- (id)init {
	if( self = [super init] ) {
		device = MTLCreateSystemDefaultDevice();
		if( !device ) {
			NSLog(@"Error: Metal is not available; Canvas2D can not draw");
			[self release];
			return nil;
		}
		queue = [device newCommandQueue];

		NSError *error = nil;
		library = [device newLibraryWithSource:EJ2DShaderSource options:nil error:&error];
		if( !library ) {
			NSLog(@"Error: Canvas2D shaders did not compile: %@", error);
		}
		vertexFunction = [library newFunctionWithName:@"ej2d_vertex"];
		for( int i = 0; i < kEJ2DProgramCount; i++ ) {
			fragmentFunctions[i] = [library newFunctionWithName:EJ2DFragmentNames[i]];
		}

		vertexDescriptor = [MTLVertexDescriptor new];
		vertexDescriptor.attributes[0].format = MTLVertexFormatFloat2;
		vertexDescriptor.attributes[0].offset = offsetof(EJVertex, pos);
		vertexDescriptor.attributes[1].format = MTLVertexFormatFloat2;
		vertexDescriptor.attributes[1].offset = offsetof(EJVertex, uv);
		vertexDescriptor.attributes[2].format = MTLVertexFormatUChar4Normalized;
		vertexDescriptor.attributes[2].offset = offsetof(EJVertex, color);
		vertexDescriptor.layouts[0].stride = sizeof(EJVertex);

		pipelines = [NSMutableDictionary new];
		depthStencilStates = [NSMutableDictionary new];

		MTLSamplerDescriptor *sd = [MTLSamplerDescriptor new];
		sd.sAddressMode = MTLSamplerAddressModeClampToEdge;
		sd.tAddressMode = MTLSamplerAddressModeClampToEdge;
		sd.minFilter = sd.magFilter = MTLSamplerMinMagFilterLinear;
		samplerLinear = [device newSamplerStateWithDescriptor:sd];
		sd.minFilter = sd.magFilter = MTLSamplerMinMagFilterNearest;
		samplerNearest = [device newSamplerStateWithDescriptor:sd];
		[sd release];

		arenasInUse = [NSMutableArray new];
		freeArenas = [NSMutableArray new];

		CVMetalTextureCacheCreate(kCFAllocatorDefault, NULL, device, NULL, &textureCache);

		// Keeping multisampled pixels between render passes needs the
		// StoreAndMultisampleResolve store action, which A9 and newer have
		maxSamples = 1;
		if( [device supportsFamily:MTLGPUFamilyApple3] ) {
			maxSamples = [device supportsTextureSampleCount:4] ? 4 : 2;
		}
		NSLog(@"Canvas2D: Metal on %@, antialiasing %@", device.name,
			maxSamples > 1 ? [NSString stringWithFormat:@"up to %d samples", maxSamples] : @"not available");
	}
	return self;
}

- (void)dealloc {
	sharedMetalContext = nil;
	[self commitAndWait];
	if( textureCache ) { CFRelease(textureCache); }
	[arenasInUse release];
	[freeArenas release];
	[arena release];
	[samplerLinear release];
	[samplerNearest release];
	[pipelines release];
	[depthStencilStates release];
	[vertexDescriptor release];
	for( int i = 0; i < kEJ2DProgramCount; i++ ) {
		[fragmentFunctions[i] release];
	}
	[vertexFunction release];
	[library release];
	[queue release];
	[device release];
	[super dealloc];
}


#pragma mark -
#pragma mark Cached states

- (id<MTLRenderPipelineState>)pipelineForProgram:(EJ2DProgram)program
	blendSource:(MTLBlendFactor)source destination:(MTLBlendFactor)destination
	colorWrite:(BOOL)colorWrite depthStencil:(BOOL)depthStencil sampleCount:(int)sampleCount
{
	NSUInteger key = program | (source << 4) | (destination << 9) | (colorWrite << 14) | (depthStencil << 15) | (sampleCount << 16);
	id<MTLRenderPipelineState> pipeline = pipelines[@(key)];
	if( pipeline ) { return pipeline; }

	MTLRenderPipelineDescriptor *pd = [MTLRenderPipelineDescriptor new];
	pd.vertexFunction = vertexFunction;
	pd.fragmentFunction = fragmentFunctions[program];
	pd.vertexDescriptor = vertexDescriptor;
	pd.rasterSampleCount = sampleCount;

	MTLRenderPipelineColorAttachmentDescriptor *color = pd.colorAttachments[0];
	color.pixelFormat = EJ_METAL_PIXEL_FORMAT;
	color.writeMask = colorWrite ? MTLColorWriteMaskAll : MTLColorWriteMaskNone;
	color.blendingEnabled = colorWrite;
	color.sourceRGBBlendFactor = color.sourceAlphaBlendFactor = source;
	color.destinationRGBBlendFactor = color.destinationAlphaBlendFactor = destination;

	if( depthStencil ) {
		pd.depthAttachmentPixelFormat = EJ_METAL_DEPTH_STENCIL_FORMAT;
		pd.stencilAttachmentPixelFormat = EJ_METAL_DEPTH_STENCIL_FORMAT;
	}

	NSError *error = nil;
	pipeline = [device newRenderPipelineStateWithDescriptor:pd error:&error];
	[pd release];
	if( !pipeline ) {
		NSLog(@"Error: Canvas2D pipeline %d: %@", (int)program, error);
		return nil;
	}
	pipelines[@(key)] = pipeline;
	[pipeline release];
	return pipeline;
}

- (id<MTLDepthStencilState>)depthStencilState:(EJ2DDepthStencil)s {
	if( !s.stencilTest ) {
		// Stencil settings don't matter with the test off; share one state
		EJ2DDepthStencil d = EJ2DDepthStencilDefault();
		d.depthCompare = s.depthCompare;
		d.depthWrite = s.depthWrite;
		s = d;
	}
	uint64_t key =
		(uint64_t)s.depthCompare |
		(uint64_t)s.depthWrite << 3 |
		(uint64_t)s.stencilTest << 4 |
		(uint64_t)s.stencilCompare << 5 |
		(uint64_t)s.stencilReadMask << 8 |
		(uint64_t)s.stencilWriteMask << 16 |
		(uint64_t)s.frontFail << 24 | (uint64_t)s.frontDepthFail << 27 | (uint64_t)s.frontPass << 30 |
		(uint64_t)s.backFail << 33 | (uint64_t)s.backDepthFail << 36 | (uint64_t)s.backPass << 39;

	id<MTLDepthStencilState> state = depthStencilStates[@(key)];
	if( state ) { return state; }

	MTLDepthStencilDescriptor *dd = [MTLDepthStencilDescriptor new];
	dd.depthCompareFunction = s.depthCompare;
	dd.depthWriteEnabled = s.depthWrite;
	if( s.stencilTest ) {
		MTLStencilDescriptor *front = [MTLStencilDescriptor new];
		front.stencilCompareFunction = s.stencilCompare;
		front.readMask = s.stencilReadMask;
		front.writeMask = s.stencilWriteMask;
		front.stencilFailureOperation = s.frontFail;
		front.depthFailureOperation = s.frontDepthFail;
		front.depthStencilPassOperation = s.frontPass;

		MTLStencilDescriptor *back = [front copy];
		back.stencilFailureOperation = s.backFail;
		back.depthFailureOperation = s.backDepthFail;
		back.depthStencilPassOperation = s.backPass;

		dd.frontFaceStencil = front;
		dd.backFaceStencil = back;
		[front release];
		[back release];
	}
	state = [device newDepthStencilStateWithDescriptor:dd];
	[dd release];
	depthStencilStates[@(key)] = state;
	[state release];
	return state;
}

- (id<MTLSamplerState>)samplerNearest:(BOOL)nearest {
	return nearest ? samplerNearest : samplerLinear;
}


#pragma mark -
#pragma mark Command buffer and encoders

- (id<MTLCommandBuffer>)commandBuffer {
	if( !commandBuffer ) {
		commandBuffer = [[queue commandBuffer] retain];
	}
	return commandBuffer;
}

- (id<MTLRenderCommandEncoder>)renderEncoderWithDescriptor:(MTLRenderPassDescriptor *)descriptor
	owner:(id<EJMetalEncoderOwner>)owner
{
	[self endEncoder];
	id<MTLRenderCommandEncoder> renderEncoder = [self.commandBuffer renderCommandEncoderWithDescriptor:descriptor];
	encoder = [renderEncoder retain];
	encoderOwner = owner;
	return renderEncoder;
}

- (id<MTLBlitCommandEncoder>)blitEncoder {
	[self endEncoder];
	id<MTLBlitCommandEncoder> blit = [self.commandBuffer blitCommandEncoder];
	encoder = [blit retain];
	return blit;
}

- (void)endEncoder {
	if( !encoder ) { return; }

	[encoder endEncoding];
	[encoder release];
	encoder = nil;

	id<EJMetalEncoderOwner> owner = encoderOwner;
	encoderOwner = nil;
	[owner metalEncoderDidEnd];
}

- (void)endEncoderIfOwner:(id)owner {
	if( encoder && encoderOwner == owner ) {
		[self endEncoder];
	}
}

- (void)commit {
	[self endEncoder];
	if( !commandBuffer ) { return; }

	// Buffers holding this frame's vertices can be reused once the GPU is done
	NSArray *used = [[arenasInUse copy] autorelease];
	NSMutableArray *pool = freeArenas;
	[commandBuffer addCompletedHandler:^(id<MTLCommandBuffer> buffer) {
		@synchronized(pool) {
			for( id<MTLBuffer> b in used ) {
				if( b.length == EJ_METAL_ARENA_SIZE ) { [pool addObject:b]; }
			}
		}
	}];
	[arenasInUse removeAllObjects];
	[arena release];
	arena = nil;
	arenaOffset = 0;

	[commandBuffer commit];
	[commandBuffer release];
	commandBuffer = nil;
}

- (void)commitAndWait {
	// Waiting on an empty command buffer waits for all work queued before it
	id<MTLCommandBuffer> buffer = [self.commandBuffer retain];
	[self commit];
	[buffer waitUntilCompleted];
	[buffer release];
}

- (id<MTLBuffer>)bufferWithBytes:(const void *)bytes length:(NSUInteger)length offset:(NSUInteger *)offset {
	NSUInteger start = (arenaOffset + 255) & ~(NSUInteger)255;
	if( !arena || start + length > arena.length ) {
		[arena release];
		arena = nil;
		if( length <= EJ_METAL_ARENA_SIZE ) {
			@synchronized(freeArenas) {
				if( freeArenas.count ) {
					arena = [freeArenas.lastObject retain];
					[freeArenas removeLastObject];
				}
			}
		}
		if( !arena ) {
			arena = [device newBufferWithLength:MAX(length, EJ_METAL_ARENA_SIZE) options:MTLResourceStorageModeShared];
		}
		[arenasInUse addObject:arena];
		start = 0;
	}
	memcpy((uint8_t *)arena.contents + start, bytes, length);
	arenaOffset = start + length;
	*offset = start;
	return arena;
}


#pragma mark -
#pragma mark Textures

- (id<MTLTexture>)newTextureWithWidth:(int)width height:(int)height format:(MTLPixelFormat)format
	usage:(MTLTextureUsage)usage storage:(MTLStorageMode)storage sampleCount:(int)sampleCount
{
	MTLTextureDescriptor *td = [MTLTextureDescriptor
		texture2DDescriptorWithPixelFormat:format width:MAX(width, 1) height:MAX(height, 1) mipmapped:NO];
	td.usage = usage;
	td.storageMode = storage;
	if( sampleCount > 1 ) {
		td.textureType = MTLTextureType2DMultisample;
		td.sampleCount = sampleCount;
	}
	return [device newTextureWithDescriptor:td];
}

- (id<MTLTexture>)newCopyOfTexture:(id<MTLTexture>)texture {
	id<MTLTexture> copy = [self newTextureWithWidth:(int)texture.width height:(int)texture.height
		format:texture.pixelFormat usage:MTLTextureUsageShaderRead | MTLTextureUsageRenderTarget
		storage:MTLStorageModePrivate sampleCount:1];
	id<MTLBlitCommandEncoder> blit = [self blitEncoder];
	[blit copyFromTexture:texture toTexture:copy];
	[self endEncoder];
	return copy;
}

- (NSMutableData *)readPixelsFromTexture:(id<MTLTexture>)texture x:(int)x y:(int)y width:(int)w height:(int)h {
	int bpp = (texture.pixelFormat == MTLPixelFormatA8Unorm || texture.pixelFormat == MTLPixelFormatR8Unorm) ? 1 : 4;
	NSMutableData *pixels = [NSMutableData dataWithLength:MAX(w, 0) * MAX(h, 0) * bpp];
	if( w <= 0 || h <= 0 ) { return pixels; }

	// The part of the region that lies on the texture
	int x0 = MAX(x, 0), y0 = MAX(y, 0);
	int x1 = MIN(x + w, (int)texture.width), y1 = MIN(y + h, (int)texture.height);
	if( x1 <= x0 || y1 <= y0 ) {
		return pixels;
	}
	int cw = x1 - x0, ch = y1 - y0;

	id<MTLBuffer> buffer = [device newBufferWithLength:cw * ch * bpp options:MTLResourceStorageModeShared];
	id<MTLBlitCommandEncoder> blit = [self blitEncoder];
	[blit copyFromTexture:texture sourceSlice:0 sourceLevel:0
		sourceOrigin:MTLOriginMake(x0, y0, 0) sourceSize:MTLSizeMake(cw, ch, 1)
		toBuffer:buffer destinationOffset:0
		destinationBytesPerRow:cw * bpp destinationBytesPerImage:cw * ch * bpp];
	[self endEncoder];
	[self commitAndWait];

	BOOL bgra = (texture.pixelFormat == MTLPixelFormatBGRA8Unorm);
	const uint8_t *src = buffer.contents;
	uint8_t *dst = pixels.mutableBytes;
	for( int row = 0; row < ch; row++ ) {
		const uint8_t *s = src + row * cw * bpp;
		uint8_t *d = dst + ((y0 - y + row) * w + (x0 - x)) * bpp;
		if( bgra ) {
			for( int i = 0; i < cw * 4; i += 4 ) {
				d[i] = s[i+2]; d[i+1] = s[i+1]; d[i+2] = s[i]; d[i+3] = s[i+3];
			}
		}
		else {
			memcpy(d, s, cw * bpp);
		}
	}
	[buffer release];
	return pixels;
}

@end
