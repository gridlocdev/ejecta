#import <UIKit/UIKit.h>
#import "EJAppViewController.h"

@interface AppDelegate : NSObject <UIApplicationDelegate>

@property (nonatomic, retain) UIWindow *window;
- (void)loadViewControllerWithScriptAtPath:(NSString *)path;
@end

// Creates the window when UIKit connects the app's scene. tvOS and iOS 27
// stop apps that don't use scenes at launch.
@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>

@property (nonatomic, retain) UIWindow *window;
@end
