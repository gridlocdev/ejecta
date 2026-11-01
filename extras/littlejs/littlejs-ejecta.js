// Runs LittleJS games on Ejecta (iOS and tvOS).
// Load order in App/index.js: littlejs.js, then this file, then the game.
//
// What it does:
// - Turns LittleJS's WebGL off. Ejecta has WebGL 1 only and LittleJS needs
//   WebGL 2, so LittleJS draws with Canvas2D, which Ejecta runs natively.
// - Gives LittleJS Ejecta's screen canvas as its main canvas. Ejecta only
//   shows window.canvas; any other canvas is offscreen.
// - Fits a fixed size canvas (setCanvasFixedSize) to the screen, centered,
//   since Ejecta has no CSS layout to do it.
//
// Not covered yet: sound. Ejecta has no Web Audio, so LittleJS sees no
// AudioContext and stays silent; the game still runs.
'use strict';
(function() {
	if( typeof setGLEnable !== 'function' ) {
		throw new Error('littlejs-ejecta.js: load littlejs.js before this file');
	}

	setGLEnable(false);

	// With WebGL off, the first canvas LittleJS makes is its main canvas.
	var createElement = document.createElement;
	var screenCanvasTaken = false;
	document.createElement = function(name) {
		if( name === 'canvas' && !screenCanvasTaken ) {
			screenCanvasTaken = true;
			return window.canvas;
		}
		return createElement.apply(document, arguments);
	};

	// In a browser CSS centers a fixed size canvas and scales it to fit.
	engineAddPlugin(undefined, function() {
		if( !canvasFixedSize.x ) { return; }
		var scale = Math.min(innerWidth / canvasFixedSize.x, innerHeight / canvasFixedSize.y);
		var width = canvasFixedSize.x * scale, height = canvasFixedSize.y * scale;
		var style = mainCanvas.style;
		style.width = width;
		style.height = height;
		style.left = (innerWidth - width) / 2;
		style.top = (innerHeight - height) / 2;
	});
})();
