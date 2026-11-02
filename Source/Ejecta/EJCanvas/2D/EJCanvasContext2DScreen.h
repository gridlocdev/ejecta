// The EJCanvas2D subclass that handles rendering to the screen (i.e. a UIView)

#import "EJCanvasContext2D.h"
#import "EJMetalView.h"
#import "EJPresentable.h"

@interface EJCanvasContext2DScreen : EJCanvasContext2D <EJPresentable> {
	EJMetalView *metalView;
	CGRect style;
}

- (void)present;
- (void)finish;

@end
