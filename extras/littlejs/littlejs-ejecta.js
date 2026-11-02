// Runs LittleJS games on Ejecta (iOS and tvOS).
// Load order in App/index.js: littlejs.js, then this file, then the game.
//
// In a browser LittleJS shows two canvases on top of each other: a WebGL 2
// canvas for sprites and a 2D canvas for text and UI. Ejecta shows only its
// screen canvas (window.canvas), so this draws both into it each frame,
// sized and centered as the page would show them. Ejecta provides WebGL 2 on
// top of WebGL 1; if a game turns WebGL off, its 2D canvas alone is shown.
//
// Sound needs nothing here: Ejecta.js provides the Web Audio API and fetch()
// that LittleJS uses for ZzFX, sound files and its audio effects.
'use strict';
(function() {
	if( typeof engineScheduleFrame !== 'function' ) {
		throw new Error('littlejs-ejecta.js: load littlejs.js before this file');
	}

	var screen = window.canvas;
	var screenContext = screen.getContext('2d');

	function composite() {
		if( !mainCanvas ) { return; }
		var dpr = window.devicePixelRatio || 1;
		var screenWidth = innerWidth * dpr, screenHeight = innerHeight * dpr;
		if( screen.width !== screenWidth || screen.height !== screenHeight ) {
			screen.width = screenWidth;
			screen.height = screenHeight;
		}

		// The size the page would show the canvas at: fitted to the window
		// for a fixed size canvas, its css size otherwise
		var width, height;
		if( canvasFixedSize.x ) {
			var scale = Math.min(screenWidth / canvasFixedSize.x, screenHeight / canvasFixedSize.y);
			width = canvasFixedSize.x * scale;
			height = canvasFixedSize.y * scale;
		}
		else {
			width = mainCanvasSize.x * dpr;
			height = mainCanvasSize.y * dpr;
		}
		var x = (screenWidth - width) / 2, y = (screenHeight - height) / 2;

		screenContext.setTransform(1, 0, 0, 1, 0, 0);
		screenContext.globalAlpha = 1;
		screenContext.globalCompositeOperation = 'source-over';
		screenContext.fillStyle = '#000';
		screenContext.fillRect(0, 0, screenWidth, screenHeight);
		if( glEnable && glCanvas ) {
			screenContext.drawImage(glCanvas, x, y, width, height);
		}
		screenContext.drawImage(mainCanvas, x, y, width, height);
	}

	// After each frame LittleJS renders, before it asks for the next one
	var scheduleFrame = engineScheduleFrame;
	engineScheduleFrame = function() {
		composite();
		return scheduleFrame.apply(this, arguments);
	};

	// The splash screen draws before the engine's frames start
	var splash = setInterval(function() {
		if( engineUpdateInternal ) { clearInterval(splash); }
		else { composite(); }
	}, 16);
})();
