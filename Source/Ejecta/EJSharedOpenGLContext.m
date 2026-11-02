#import "EJSharedOpenGLContext.h"

@implementation EJSharedOpenGLContext

@synthesize glContext2D;
@synthesize glSharegroup;

static EJSharedOpenGLContext *sharedOpenGLContext;
+ (EJSharedOpenGLContext *)instance {
	if( !sharedOpenGLContext ) {
		sharedOpenGLContext = [[EJSharedOpenGLContext new] autorelease];
	}
    return sharedOpenGLContext;
}

- (id)init {
	if( self = [super init] ) {
		// OpenGL ES 3, so WebGL 2 contexts can share its textures
		glContext2D = [[EAGLContext alloc] initWithAPI:kEAGLRenderingAPIOpenGLES3];
		glSharegroup = glContext2D.sharegroup;
	}
	return self;
}

- (void)dealloc {
	sharedOpenGLContext = nil;
	
	[glContext2D release];
	
	[EAGLContext setCurrentContext:nil];
	[super dealloc];
}

@end
