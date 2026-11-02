#import "EJCanvasContext2DTexture.h"
#import "EJJavaScriptView.h"

@implementation EJCanvasContext2DTexture

- (void)resizeToWidth:(short)newWidth height:(short)newHeight {
	[self flushBuffers];
	
	bufferWidth = width = newWidth;
	bufferHeight = height = newHeight;
	
	NSLog(
		@"Creating Offscreen Canvas (2D, Metal): "
			@"size: %dx%d, "
			@"antialias: %@",
		width, height,
		(msaaEnabled ? [NSString stringWithFormat:@"yes (%d samples)", msaaSamples] : @"no")
	);
	
	// Drawing already queued keeps the previous texture alive until it's done
	[metal endEncoderIfOwner:self];
	[texture release];
	texture = [[EJTexture alloc] initAsMetalRenderTargetWithWidth:newWidth height:newHeight];
	
	[self resetFramebuffer];
}

- (EJTexture *)texture {
	// Drawn into itself: a copy of the pixels as they are now
	if( scriptView.currentRenderingContext == self ) {
		[self endRenderPass];
		id<MTLTexture> copy = [metal newCopyOfTexture:texture.metalTexture];
		EJTexture *snapshot = [[[EJTexture alloc] initWithMetalTexture:copy] autorelease];
		[copy release];
		return snapshot;
	}
	
	// Drawn into another canvas: the texture directly. Metal runs the
	// drawing in order, so everything drawn so far shows.
	[self endRenderPass];
	return texture;
}

@end
