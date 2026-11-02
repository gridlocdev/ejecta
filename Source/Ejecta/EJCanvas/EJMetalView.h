// A UIView backed by a CAMetalLayer, for the screen Canvas2D. The layer's
// drawable has the canvas size and is scaled to the view's frame.

#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#import <Metal/Metal.h>

@interface EJMetalView : UIView

- (id)initWithFrame:(CGRect)frame device:(id<MTLDevice>)device;

@property (nonatomic, readonly) CAMetalLayer *metalLayer;

@end
