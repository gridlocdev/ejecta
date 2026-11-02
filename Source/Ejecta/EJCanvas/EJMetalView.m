#import "EJMetalView.h"
#import "EJSharedMetalContext.h"

@implementation EJMetalView

+ (Class)layerClass {
	return [CAMetalLayer class];
}

- (id)initWithFrame:(CGRect)frame device:(id<MTLDevice>)device {
	if( self = [super initWithFrame:frame] ) {
		#if !TARGET_OS_TV
			[self setMultipleTouchEnabled:YES];
		#endif
		
		CAMetalLayer *layer = self.metalLayer;
		layer.device = device;
		layer.pixelFormat = EJ_METAL_PIXEL_FORMAT;
		layer.opaque = YES;
		
		// The canvas texture is copied into the drawable, not drawn into it
		layer.framebufferOnly = NO;
	}
	return self;
}

- (CAMetalLayer *)metalLayer {
	return (CAMetalLayer *)self.layer;
}

@end
