#import "EJSharedOpenGLContext.h"

@implementation EJSharedOpenGLContext

@synthesize glContext2D;
@synthesize glSharegroup;
@synthesize textureCache;

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
		CVOpenGLESTextureCacheCreate(kCFAllocatorDefault, NULL, glContext2D, NULL, &textureCache);
	}
	return self;
}

- (void)dealloc {
	sharedOpenGLContext = nil;
	
	if( textureCache ) { CFRelease(textureCache); }
	[glContext2D release];
	
	[EAGLContext setCurrentContext:nil];
	[super dealloc];
}

@end
