#import "EJCanvasContextWebGLTexture.h"

@implementation EJCanvasContextWebGLTexture

- (void)dealloc {
	[texture waitForMetalReads];
	[texture release];
	[super dealloc];
}

- (void)resizeToWidth:(short)newWidth height:(short)newHeight {
	[self flushBuffers];
	
	bufferWidth = width = newWidth;
	bufferHeight = height = newHeight;
	
	NSLog(
		@"Creating Offscreen Canvas (WebGL): size: %dx%d, antialias: %@",
		width, height,
		(msaaEnabled ? [NSString stringWithFormat:@"yes (%d samples)", msaaSamples] : @"no")
	);
	
	// Get the previously bound frame- and renderbuffers. If none are bound
	// yet (a new canvas), use the default buffers: binding 0 would leave
	// an offscreen canvas drawing to no framebuffer at all.
	GLint previousFrameBuffer;
	GLint previousRenderBuffer;
	glGetIntegerv( GL_FRAMEBUFFER_BINDING, &previousFrameBuffer );
	glGetIntegerv( GL_RENDERBUFFER_BINDING, &previousRenderBuffer );
	if( !previousFrameBuffer ) {
		previousFrameBuffer = EJ_WEBGL_DEFAULT_FRAMEBUFFER;
	}
	if( !previousRenderBuffer ) {
		previousRenderBuffer = EJ_WEBGL_DEFAULT_RENDERBUFFER;
	}
	
	glBindFramebuffer(GL_FRAMEBUFFER, viewFrameBuffer);
	glBindRenderbuffer(GL_RENDERBUFFER, viewRenderBuffer);
	
	// Release previous texture if any, create the new texture and set it as
	// the rendering target for this framebuffer. It's a surface Metal can
	// read too, so Canvas2D draws it without copying.
	[texture waitForMetalReads];
	[texture release];
	texture = [[EJTexture alloc] initAsInteropRenderTargetWithWidth:newWidth height:newHeight];
	texture.drawFlippedY = true;
	
	glBindFramebuffer(GL_FRAMEBUFFER, viewFrameBuffer);
	glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texture.textureId, 0);
	
	[self resizeAuxiliaryBuffers];
	
	// Should OpenGL not render into the shared surface, use a plain texture;
	// drawing it into a 2D canvas then copies its pixels
	if( texture.isInterop && glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE ) {
		NSLog(@"Warning: OpenGL can't render into a surface shared with Metal; using a copy instead");
		[texture release];
		texture = [[EJTexture alloc] initAsRenderTargetWithWidth:newWidth height:newHeight fbo:viewFrameBuffer];
		texture.drawFlippedY = true;
		glBindFramebuffer(GL_FRAMEBUFFER, viewFrameBuffer);
		glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texture.textureId, 0);
	}
	
	// Clear
	glViewport(0, 0, width, height);
	[self clear];

	if ([self alphaShouldLock]) {
		[self lockAlpha];
	}
	
	// Reset to the previously bound frame and renderbuffers
	[self bindFramebuffer:previousFrameBuffer toTarget:GL_FRAMEBUFFER];
	[self bindRenderbuffer:previousRenderBuffer toTarget:GL_RENDERBUFFER];
}

- (EJTexture *)texture {
	// Usually called with a 2D canvas current, whose OpenGL context is the
	// shared one; resolving and flushing need this canvas's own context
	EAGLContext *previousContext = EAGLContext.currentContext;
	if( previousContext != glContext ) {
		[EAGLContext setCurrentContext:glContext];
	}
	
	// If this texture Canvas uses MSAA, we need to resolve the MSAA first,
	// before we can use the texture for drawing.
	if( msaaEnabled && needsPresenting ) {
		GLint previousFrameBuffer;
		glGetIntegerv( GL_FRAMEBUFFER_BINDING, &previousFrameBuffer );
		
		//Bind the MSAA and View frameBuffers and resolve
		glBindFramebuffer(GL_READ_FRAMEBUFFER_APPLE, msaaFrameBuffer);
		glBindFramebuffer(GL_DRAW_FRAMEBUFFER_APPLE, viewFrameBuffer);
		glResolveMultisampleFramebufferAPPLE();
		
		glBindFramebuffer(GL_FRAMEBUFFER, previousFrameBuffer);
		needsPresenting = NO;
	}
	
	// Submit what was drawn, so Metal (or another context) sees it
	glFlush();
	
	if( previousContext != glContext ) {
		[EAGLContext setCurrentContext:previousContext];
	}
	return texture;
}

- (void)prepare {
	// Canvas2D may still be reading the last frame from the surface
	[texture waitForMetalReads];
	[super prepare];
}

@end
