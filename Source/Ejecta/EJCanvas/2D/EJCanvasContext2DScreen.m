#import <QuartzCore/QuartzCore.h>
#import "EJCanvasContext2DScreen.h"
#import "EJJavaScriptView.h"

@implementation EJCanvasContext2DScreen
@synthesize style;
@synthesize view = metalView;

- (void)dealloc {
	[metalView removeFromSuperview];
	[metalView release];
	[super dealloc];
}

- (void)setStyle:(CGRect)newStyle {
	if(
		(style.size.width ? style.size.width : width) != newStyle.size.width ||
		(style.size.height ? style.size.height : height) != newStyle.size.height
	) {
		// Must resize
		style = newStyle;
		
		// Only resize if we already have a view. Otherwise the style will be
		// honored in the 'create' call.
		if( metalView ) {
			[self resizeToWidth:width height:height];
		}
	}
	else {
		// Just reposition
		style = newStyle;
		if( metalView ) {
			metalView.frame = self.frame;
		}
	}
}

- (CGRect)frame {
	// Returns the view frame with the current style. If the style's witdth/height
	// is zero, the canvas width/height is used
	return CGRectMake(
		style.origin.x,
		style.origin.y,
		(style.size.width ? style.size.width : width),
		(style.size.height ? style.size.height : height)
	);
}

- (void)resizeToWidth:(short)newWidth height:(short)newHeight {
	[self flushBuffers];
	
	// Only the style changed: move and scale the view, keep the pixels
	if( texture && metalView && newWidth == width && newHeight == height ) {
		CGRect frame = self.frame;
		float contentScale = MAX(width/frame.size.width, height/frame.size.height);
		metalView.frame = frame;
		metalView.contentScaleFactor = contentScale;
		metalView.layer.contentsScale = contentScale;
		metalView.metalLayer.drawableSize = CGSizeMake(MAX(width, 1), MAX(height, 1));
		needsPresenting = YES;
		return;
	}
	
	width = newWidth;
	height = newHeight;
	
	CGRect frame = self.frame;
	float contentScale = MAX(width/frame.size.width, height/frame.size.height);
	
	NSLog(
		@"Creating ScreenCanvas (2D, Metal): "
			@"size: %dx%d, "
			@"style: %.0fx%.0f, "
			@"antialias: %@",
		width, height, 
		frame.size.width, frame.size.height,
		(msaaEnabled ? [NSString stringWithFormat:@"yes (%d samples)", msaaSamples] : @"no")
	);
	
	if( !metalView ) {
		metalView = [[EJMetalView alloc] initWithFrame:frame device:metal.device];
		[scriptView addSubview:metalView];
	}
	else {
		metalView.frame = frame;
	}
	metalView.contentScaleFactor = contentScale;
	metalView.layer.contentsScale = contentScale;
	metalView.metalLayer.drawableSize = CGSizeMake(MAX(width, 1), MAX(height, 1));
	
	bufferWidth = width;
	bufferHeight = height;
	
	// Drawing goes into a texture of our own, copied to the screen on
	// present(); so the pixels stay when the drawable is swapped
	[metal endEncoderIfOwner:self];
	[texture release];
	texture = [[EJTexture alloc] initAsMetalRenderTargetWithWidth:width height:height];
	
	[super resetFramebuffer];
}

- (void)finish {
	[metal commitAndWait];
}

- (void)present {
	[self flushBuffers];
	
	if( !needsPresenting ) { return; }
	
	[self endRenderPass];
	
	id<CAMetalDrawable> drawable = [metalView.metalLayer nextDrawable];
	id<MTLTexture> source = texture.metalTexture;
	if( drawable && source ) {
		id<MTLTexture> target = drawable.texture;
		id<MTLBlitCommandEncoder> blit = [metal blitEncoder];
		[blit copyFromTexture:source sourceSlice:0 sourceLevel:0 sourceOrigin:MTLOriginMake(0, 0, 0)
			sourceSize:MTLSizeMake(MIN(source.width, target.width), MIN(source.height, target.height), 1)
			toTexture:target destinationSlice:0 destinationLevel:0 destinationOrigin:MTLOriginMake(0, 0, 0)];
		[metal endEncoder];
		[metal.commandBuffer presentDrawable:drawable];
	}
	[metal commit];
	needsPresenting = NO;
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
	
	// Drawn into another canvas: the pixels directly. Metal runs the
	// drawing in order, so everything drawn so far shows.
	[self endRenderPass];
	return texture;
}

@end
