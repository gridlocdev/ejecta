#import "EJBindingCanvasStyle.h"

#import "EJBindingCanvas.h"

@implementation EJBindingCanvasStyle
@synthesize binding;

- (JSObjectRef)jsObject {
	return jsObject;
}

// Values are in px. A "%" value is relative to the screen (the script view),
// so web games that size their canvas with "100%" fill it as in a browser.
#define EJ_BIND_PX_STYLE(NAME, TARGET, SCREEN_DIMENSION) \
	EJ_BIND_GET(NAME, ctx) { \
		return NSStringToJSValue(ctx, [NSString stringWithFormat:@"%fpx", TARGET]);\
	} \
	\
	EJ_BIND_SET(NAME, ctx, value) { \
		if( JSValueIsNumber(ctx, value) ) { \
			TARGET = JSValueToNumberFast(ctx, value); \
			return; \
		} \
		NSString *valueString = JSValueToNSString(ctx, value); \
		if( valueString.length > 0 ) { \
			float NAME = 0; \
			sscanf( valueString.UTF8String, "%f", &NAME); \
			if( [valueString hasSuffix:@"%"] ) { \
				NAME = NAME / 100.0f * binding->scriptView.bounds.size.SCREEN_DIMENSION; \
			} \
			TARGET = NAME; \
		} \
		else { \
			TARGET = 0; \
		} \
	}

	EJ_BIND_PX_STYLE(width, binding.styleWidth, width);
	EJ_BIND_PX_STYLE(height, binding.styleHeight, height);
	EJ_BIND_PX_STYLE(left, binding.styleLeft, width);
	EJ_BIND_PX_STYLE(top, binding.styleTop, height);

#undef EJ_BIND_PX_STYLE

EJ_BIND_ENUM(imageRendering, binding.imageRendering,
	"auto",			// kEJCanvasImageRenderingAuto,
	"crisp-edges",	// kEJCanvasImageRenderingCrispEdges,
	"pixelated"		// kEJCanvasImageRenderingPixelated
);

@end
