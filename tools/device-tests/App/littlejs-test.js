// LittleJS on its WebGL 2 path, through extras/littlejs/littlejs-ejecta.js:
// a blue WebGL clear and a red square, composited into the screen canvas.
// Loaded by index.js after littlejs.js and the shim, last of all the tests.

function littlejsTest( report ) {
	setShowSplashScreen(false);
	setCanvasClearColor(rgb(0, 0, 1));
	engineInit(
		function() { setCameraScale(32); },
		undefined, undefined,
		function() { drawRect(vec2(0), vec2(6), rgb(1, 0, 0)); }
	);
	setTimeout(function() {
		var screen = window.canvas.getContext('2d');
		var w = window.canvas.width, h = window.canvas.height;
		var center = rgba(screen.getImageData(w / 2 | 0, h / 2 | 0, 1, 1).data);
		var corner = rgba(screen.getImageData(10, 10, 1, 1).data);
		report('littlejs uses WebGL 2', glEnable && !!glContext, 'glEnable ' + glEnable);
		report('littlejs WebGL sprite on screen', same(center, [255, 0, 0, 255], 8), center);
		report('littlejs WebGL clear color on screen', same(corner, [0, 0, 255, 255], 8), corner);
		report.done();
	}, 2000);
}
