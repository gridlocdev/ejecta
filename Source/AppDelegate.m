
#import "AppDelegate.h"
#import "EJJavaScriptView.h"
@implementation AppDelegate
@synthesize window;

#pragma mark -
#pragma mark Application lifecycle

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    
	// Optionally set the idle timer disabled, this prevents the device from sleep when
	// not being interacted with by touch. ie. games with motion control.
	application.idleTimerDisabled = YES;
	
	// The window is made by the SceneDelegate (named in Info.plist) once the scene connects
    return YES;
}

// Also called by ejecta.load() to start another script
- (void)loadViewControllerWithScriptAtPath:(NSString *)path {
	// Release any previous ViewController
	window.rootViewController = nil;
	
	EJAppViewController *vc = [[EJAppViewController alloc] initWithScriptAtPath:path];
	window.rootViewController = vc;
	[vc release];
}


#pragma mark -
#pragma mark Memory management

- (void)dealloc {
	window.rootViewController = nil;
	[window release];
    [super dealloc];
}


@end


@implementation SceneDelegate
@synthesize window;

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session
	options:(UISceneConnectionOptions *)connectionOptions
{
	if( ![scene isKindOfClass:UIWindowScene.class] ) { return; }
	
	window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
	AppDelegate *app = (AppDelegate *)UIApplication.sharedApplication.delegate;
	app.window = window;
	[app loadViewControllerWithScriptAtPath:@"index.js"];
	
	[window makeKeyAndVisible];
}

- (void)dealloc {
	[window release];
	[super dealloc];
}

@end
