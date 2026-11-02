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
		glContext2D = [[EAGLContext alloc] initWithAPI:kEAGLRenderingAPIOpenGLES2];
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
