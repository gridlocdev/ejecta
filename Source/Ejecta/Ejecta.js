// This file is always executed before the App's index.js. It sets up most of
// Ejecta's functionality. It initializes some global properties, such as window
// dimensions and the userAgent, provides global functions such as setInterval()
// and setTimeout() and the console object, emulates a tiny bit of DOM
// functionality and sets up handlers for Touch events and others.


// Make 'window' the global scope
self = window = this;
window.top = window.parent = window;

(function(window) {

// The 'ej' object provides some basic info and utility functions
var ej = window.ejecta = new Ejecta.GlobalUtils();

// Set up the screen properties and useragent
window.devicePixelRatio = ej.devicePixelRatio;
window.innerWidth = ej.screenWidth;
window.innerHeight = ej.screenHeight;

Object.defineProperty(window, 'orientation', {
	get: function() {return ej.orientation; }
});

window.screen = {
	availWidth: window.innerWidth,
	availHeight: window.innerHeight
};

var geolocation = null;
window.navigator = {
	language: ej.language,
	userAgent: ej.userAgent,
	appVersion: ej.appVersion,
	platform: ej.platform,
	get onLine() { return ej.onLine; }, // re-evaluate on each get
	get geolocation(){ // Lazily create geolocation instance
		geolocation = geolocation || new Ejecta.Geolocation();
		return geolocation;
	}
};

// Create the default screen canvas
window.canvas = new Ejecta.Canvas();
window.canvas.type = 'canvas';

// The console object. Messages go to the device log; JavaScriptCore's own
// console, if there is one, also gets them, so they show in Safari's Web
// Inspector when it is attached (debug builds).
var inspectorConsole = window.console;
window.console = {

	// We try to be sensible of how much data we want to log here. Only the first
	// level of an Object or Array is parsed. All subsequent levels are ommited.
	// Arrays are shortened to the first 32 entries.
	// To log an Object and traverse all levels, use console.logJSON()
	_arrayMaxLength: 32,
	
	_toString: function(obj, deep) {
		if( obj instanceof Error ) {
			return obj.name + ': ' + obj.message + (obj.stack ? '\n' + obj.stack : '');
		}
		if( deep ) {
			return JSON.stringify(obj);
		}
		else if( obj instanceof Array || ArrayBuffer.isView(obj) ) {
			var s = '',
				length = Math.min(obj.length, window.console._arrayMaxLength),
				omitted = obj.length - length;
			for( var i = 0; i < length; i++ ) {
				s += (i === 0 ? '' : ', ') + window.console._toStringFlat(obj[i]);
			}
			return '[' + s + (omitted ? ', ...'+omitted+' more]' : ']');
		}
		else {
			var s = '',
				first = true;
			for( var i in obj ) {
				s += (first ? '' : ', ') + i + ': ' + window.console._toStringFlat(obj[i]);
				first = false;
			}
			return '{'+s+'}';
		}
	},
	
	_toStringFlat: function(obj) {
		if( typeof(obj) === 'function' ) {
			return '[Function]';
		}
		else if( obj instanceof Array || ArrayBuffer.isView(obj) ) {
			return '[Array '+obj.length+']';
		}
		else {
			return obj;
		}
	},
	
	_log: function(level, args, deep) {
		var s = level + ':';
		for (var i = 0; i < args.length; i++) {
			var arg = args[i];
			s += ' ' + (!arg || typeof(arg) !== 'object'
				? arg
				: window.console._toString(arg, deep));
		}
		ej.log( s );
		
		var method = inspectorConsole && inspectorConsole[level === 'JSON' ? 'log' : level.toLowerCase()];
		if( typeof method === 'function' ) {
			method.apply(inspectorConsole, args);
		}
	},
	
	assert: function() {
		var args = Array.prototype.slice.call(arguments);
		var assertion = args.shift();
		if( !assertion ) {
			ej.log( 'Assertion failed: ' + args.join(', ') );
		}
	}
};
window.console.debug = function () { window.console._log('DEBUG', arguments); };
window.console.info = function () { window.console._log('INFO', arguments); };
window.console.warn = function () { window.console._log('WARN', arguments); };
window.console.error = function () { window.console._log('ERROR', arguments); };
window.console.log = function () { window.console._log('LOG', arguments); };
window.console.logJSON = function () { window.console._log('JSON', arguments, true); };

var consoleTimers = {};
console.time = function(name) {
	consoleTimers[name] = ej.performanceNow();
};

console.timeEnd = function(name) {
	var timeStart = consoleTimers[name];
	if( !timeStart ) {
		return;
	}

	var timeElapsed = ej.performanceNow() - timeStart;
	console.log(name + ": " + timeElapsed + "ms");
	delete consoleTimers[name];
};


// CommonJS style require()
var loadedModules = {};
window.require = function( name ) {
	var id = name.replace(/\.js$/,'');
	if( !loadedModules[id] ) {
		var exports = {};
		var module = { id: id, uri: id + '.js', exports: exports };
		window.ejecta.requireModule( id, module, exports );
		// Some modules override module.exports, so use the module.exports
		// reference only after loading the module
		loadedModules[id] = module.exports;
	}
	
	return loadedModules[id];
};

// Timers
window.performance = {now: function() {return ej.performanceNow();} };
window.setTimeout = function(cb, t){ return ej.setTimeout(cb, t||0); };
window.setInterval = function(cb, t){ return ej.setInterval(cb, t||0); };
window.clearTimeout = function(id){ return ej.clearTimeout(id); };
window.clearInterval = function(id){ return ej.clearInterval(id); };
window.requestAnimationFrame = function(cb, element){
	return ej.setTimeout(function(){ cb(ej.performanceNow()); }, 16);
};
window.cancelAnimationFrame = function (id) {
	return ej.clearTimeout(id);
};


// The native Image, Audio, HttpRequest and LocalStorage class mimic the real elements
window.Image = Ejecta.Image;
window.Audio = Ejecta.Audio;
window.Video = Ejecta.Video;
window.XMLHttpRequest = Ejecta.HttpRequest;
window.localStorage = new Ejecta.LocalStorage();
window.WebSocket = Ejecta.WebSocket;


window.Event = function (type) {
	this.type = type;
	this.cancelBubble = false;
	this.cancelable = false;
	this.target = null;
	this.timestamp = ej.performanceNow();
	
	this.initEvent = function (type, bubbles, cancelable) {
		this.type = type;
		this.cancelBubble = bubbles;
		this.cancelable = cancelable;
		this.timestamp = ej.performanceNow();
	};

	this.preventDefault = function () {};
	this.stopPropagation = function () {};
};

window.location = { href: 'index.js' };
window.location.reload = function() {
	ejecta.load('index.js');
}

window.open = function(url) { ej.openURL(url); };


// Set up a "fake" HTMLElement
HTMLElement = function( tagName ){
	this.tagName = tagName.toUpperCase();
	this.children = [];
	this.style = {};
};

HTMLElement.prototype.appendChild = function( element ) {
	this.children.push( element );
	
	// If the child is a script element, begin to load it or execute it
	if( element.tagName && element.tagName.toLowerCase() == 'script' ) {
		if ( element.src ) {
			ej.setTimeout( function(){
				ej.include( element.src );
				if( element.onload ) {
					element.onload({
						type: 'load',
						currentTarget: element
					});
				}
			}, 1);
		} else if( element.text ) {
			window.eval( element.text );
		}
	}
	element.parentElement = element.parentNode = this;
	return element;
};

HTMLElement.prototype.insertBefore = function( newElement, existingElement ) {
	// Just append; we don't care about order here
	return this.appendChild( newElement );
};

HTMLElement.prototype.removeChild = function( node ) {
	for( var i = this.children.length; i--; ) {
		if( this.children[i] === node ) {
			this.children.splice(i, 1);
		}
	}
	return node;
};

HTMLElement.prototype.getBoundingClientRect = function() {
	return {top: 0, left: 0, width: window.innerWidth, height: window.innerHeight};
};

HTMLElement.prototype.setAttribute = function(attr, value){
	this[attr] = value;
};

HTMLElement.prototype.getAttribute = function(attr){
	return this[attr];
};

HTMLElement.prototype.addEventListener = function(event, method){
	if (event === 'load') {
		this.onload = method;
	}
};

HTMLElement.prototype.removeEventListener = function(event, method){
	if (event === 'load') {
		this.onload = undefined;
	}
};

// The document object
window.document = {
	readyState: 'complete',
	documentElement: window,
	location: window.location,
	visibilityState: 'visible',
	hidden: false,
	style: {},
	
	head: new HTMLElement( 'head' ),
	body: new HTMLElement( 'body' ),
	activeElement: null,
	
	events: {},
	
	createElement: function( name ) {
		if( name === 'canvas' ) {
			var canvas = new Ejecta.Canvas();
			canvas.type = 'canvas';
			// Offscreen canvases get no events (e.g. webglcontextlost never
			// happens), but scripts can listen for them
			canvas.addEventListener = canvas.removeEventListener = function() {};
			return canvas;
		}
		else if( name == 'audio' ) {
			return new Ejecta.Audio();
		}
		else if( name == 'video' ) {
			return new Ejecta.Video();
		}
		else if( name === 'img' ) {
			return new window.Image();
		}
		else if (name === 'input' || name === 'textarea') {
			return new Ejecta.KeyInput();
 		}
		return new HTMLElement( name );
	},
	
	getElementById: function( id ){
		if( id === 'canvas' ) {
			return window.canvas;
		}
		return null;
	},
	
	getElementsByTagName: function( tagName ) {
		var elements = [], children, i;

		tagName = tagName.toLowerCase();

		if( tagName === 'head' ) {
			elements.push(document.head);
		}
		else if( tagName === 'body' ) {
			elements.push(document.body);
		}
		else {
			children = document.body.children;
			for (i = 0; i < children.length; i++) {
				if (children[i].tagName.toLowerCase() === tagName) {
					elements.push(children[i]);
				}
			}
			children = undefined;
		}
		return elements;
	},

	hasFocus: function() { return !this.hidden; },

	createEvent: function (type) { 
		return new window.Event(type); 
	},
	
	addEventListener: function( type, callback, useCapture ){
		if( type == 'DOMContentLoaded' ) {
			ej.setTimeout( callback, 1 );
			return;
		}
		if( !this.events[type] ) {
			this.events[type] = [];
			
			// call the event initializer, if this is the first time we
			// bind to this event.
			if( typeof(this._eventInitializers[type]) == 'function' ) {
				this._eventInitializers[type]();
			}
		}
		this.events[type].push( callback );
	},
	
	removeEventListener: function( type, callback ) {
		var listeners = this.events[ type ];
		if( !listeners ) { return; }
		
		for( var i = listeners.length; i--; ) {
			if( listeners[i] === callback ) {
				listeners.splice(i, 1);
			}
		}
	},
	
	_eventInitializers: {},
	dispatchEvent: function( event ) {
		var listeners = this.events[ event.type ];
		if( !listeners ) { return; }
		
		for( var i = 0; i < listeners.length; i++ ) {
			listeners[i]( event );
		}
	}
};

document.activeElement = document.body;

window.canvas.addEventListener = window.addEventListener = function( type, callback ) {
	window.document.addEventListener(type,callback);
};
window.canvas.removeEventListener = window.removeEventListener = function( type, callback ) {
	window.document.removeEventListener(type,callback);
};
window.canvas.getBoundingClientRect = function() {
	return {
		top: this.offsetTop, left: this.offsetLeft,
		width: this.offsetWidth, height: this.offsetHeight
	};
};

var eventInit = document._eventInitializers;



// Touch events

// Set touch event properties for feature detection
window.ontouchstart = window.ontouchend = window.ontouchmove = null;
document.ontouchstart = document.ontouchend = document.ontouchmove = null;

// Setting up the 'event' object for touch events in native code is quite
// a bit of work, so instead we do it here in JavaScript and have the native
// touch class just call a simple callback.
var touchInput = null;
var touchEvent = {
	type: 'touchstart',
	target: window.canvas,
	currentTarget: window.canvas,
	touches: null,
	targetTouches: null,
	changedTouches: null,
	timestamp: 0,
	preventDefault: function(){},
	stopPropagation: function(){}
};

var dispatchTouchEvent = function( type, all, changed, timestamp ) {
	touchEvent.touches = all;
	touchEvent.targetTouches = all;
	touchEvent.changedTouches = changed;
	touchEvent.type = type;
	touchEvent.timestamp = timestamp;
	
	document.dispatchEvent( touchEvent );
};
eventInit.touchstart = eventInit.touchend = eventInit.touchmove = function() {
	if( touchInput ) { return; }

	touchInput = new Ejecta.TouchInput(window.canvas);
	touchInput.ontouchstart = dispatchTouchEvent.bind(window, 'touchstart');
	touchInput.ontouchend = dispatchTouchEvent.bind(window, 'touchend');
	touchInput.ontouchmove = dispatchTouchEvent.bind(window, 'touchmove');
};



// DeviceMotion and DeviceOrientation events

var deviceMotion = null;
var deviceMotionEvent = {
	type: 'devicemotion',
	target: window.canvas,
	currentTarget: window.canvas,
	interval: 16,
	acceleration: {x: 0, y: 0, z: 0},
	accelerationIncludingGravity: {x: 0, y: 0, z: 0},
	rotationRate: {alpha: 0, beta: 0, gamma: 0},
	timestamp: 0,
	preventDefault: function(){},
	stopPropagation: function(){}
};

var deviceOrientationEvent = {
	type: 'deviceorientation',
	target: window.canvas,
	currentTarget: window.canvas,
	alpha: null,
	beta: null,
	gamma: null,
	absolute: true,
	timestamp: 0,
	preventDefault: function(){},
	stopPropagation: function(){}
};

eventInit.deviceorientation = eventInit.devicemotion = function() {
	if( deviceMotion ) { return; }
	
	deviceMotion = new Ejecta.DeviceMotion();
	deviceMotionEvent.interval = deviceMotion.interval;
	
	// Callback for Devices that have a Gyro
	deviceMotion.ondevicemotion = function( agx, agy, agz, ax, ay, az, rx, ry, rz, ox, oy, oz, timestamp ) {
		deviceMotionEvent.accelerationIncludingGravity.x = agx;
		deviceMotionEvent.accelerationIncludingGravity.y = agy;
		deviceMotionEvent.accelerationIncludingGravity.z = agz;
	
		deviceMotionEvent.acceleration.x = ax;
		deviceMotionEvent.acceleration.y = ay;
		deviceMotionEvent.acceleration.z = az;

		deviceMotionEvent.rotationRate.alpha = rx;
		deviceMotionEvent.rotationRate.beta = ry;
		deviceMotionEvent.rotationRate.gamma = rz;
 
		deviceMotionEvent.timestamp = timestamp;

		document.dispatchEvent( deviceMotionEvent );


		deviceOrientationEvent.alpha = ox;
		deviceOrientationEvent.beta = oy;
		deviceOrientationEvent.gamma = oz;
 
		deviceOrientationEvent.timestamp = timestamp;

		document.dispatchEvent( deviceOrientationEvent );
	};
	
	// Callback for Devices that only have an accelerometer
	deviceMotion.onacceleration = function( agx, agy, agz, timestamp ) {
		deviceMotionEvent.accelerationIncludingGravity.x = agx;
		deviceMotionEvent.accelerationIncludingGravity.y = agy;
		deviceMotionEvent.accelerationIncludingGravity.z = agz;
	
		deviceMotionEvent.acceleration = null;
		deviceMotionEvent.rotationRate = null;
 
		deviceMotionEvent.timestamp = timestamp;
	
		document.dispatchEvent( deviceMotionEvent );
	};
};



// Window events (resize/pagehide/pageshow)

var windowEvents = null;

var lifecycleEvent = {
	type: 'pagehide',
	target: window.document,
	currentTarget: window.document,
	timestamp: 0,
	preventDefault: function(){},
	stopPropagation: function(){}
};

var resizeEvent = {
	type: 'resize',
	target: window,
	currentTarget: window,
	timestamp: 0,
	preventDefault: function(){},
	stopPropagation: function(){}
};

var visibilityEvent = {
	type: 'visibilitychange',
	target: window.document,
	currentTarget: window.document,
	timestamp: 0,
	preventDefault: function(){},
	stopPropagation: function(){}
};

eventInit.visibilitychange = eventInit.pagehide = eventInit.pageshow = eventInit.resize = function() {
	if( windowEvents ) { return; }
	
	windowEvents = new Ejecta.WindowEvents();
	
	windowEvents.onpagehide = function() {
		document.hidden = true;
		document.visibilityState = 'hidden';
		visibilityEvent.timestamp = ej.performanceNow();
		document.dispatchEvent( visibilityEvent );
	
		lifecycleEvent.type = 'pagehide';
		document.dispatchEvent( lifecycleEvent );
	};
	
	windowEvents.onpageshow = function() {
		document.hidden = false;
		document.visibilityState = 'visible';
		visibilityEvent.timestamp = ej.performanceNow();
		document.dispatchEvent( visibilityEvent );
	
		lifecycleEvent.type = 'pageshow';
		document.dispatchEvent( lifecycleEvent );
	};

	windowEvents.onresize = function() {
		window.innerWidth = ej.screenWidth;
		window.innerHeight = ej.screenHeight;
		resizeEvent.timestamp = ej.performanceNow();
		document.dispatchEvent(resizeEvent);
	};
};


// Gamepad API

var gamepadProvider = null;
var initGamepadProvider = function() {
	if( gamepadProvider ) { return; }
	gamepadProvider = new Ejecta.GamepadProvider();
	
	gamepadProvider.ongamepadconnected = gamepadProvider.ongamepaddisconnected = function(ev) {
		document.dispatchEvent(ev);
	};
};

navigator.getGamepads = function() {
	initGamepadProvider();
	return gamepadProvider.getGamepads();
};

eventInit.gamepadconnected = eventInit.gamepaddisconnected = initGamepadProvider;


// fetch()

// Built on XMLHttpRequest, so it reads files from the App folder like any
// other request. A local file that doesn't exist answers 404, as a web server
// would, instead of failing the request.

var utf8Decode = function( buffer ) {
	var bytes = new Uint8Array(buffer), s = '';
	for( var i = 0; i < bytes.length; i += 0x8000 ) {
		s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
	}
	try { return decodeURIComponent(escape(s)); }
	catch( err ) { return s; } // not valid UTF-8; hand back the bytes as Latin-1
};

window.Response = function( body, init ) {
	init = init || {};
	this._body = body || new ArrayBuffer(0);
	this.status = init.status === undefined ? 200 : init.status;
	this.statusText = init.statusText || '';
	this.ok = this.status >= 200 && this.status < 300;
	this.url = init.url || '';
	this.type = 'basic';
	this.redirected = false;
	this.bodyUsed = false;
	var rawHeaders = init.headers || '';
	this.headers = {
		get: function( name ) {
			var match = new RegExp('^' + name + ':\\s*(.*)$', 'im').exec(rawHeaders);
			return match ? match[1].trim() : null;
		},
		has: function( name ) { return this.get(name) !== null; }
	};
};
window.Response.prototype.arrayBuffer = function() {
	this.bodyUsed = true;
	return Promise.resolve(this._body);
};
window.Response.prototype.text = function() {
	this.bodyUsed = true;
	return Promise.resolve(utf8Decode(this._body));
};
window.Response.prototype.json = function() {
	return this.text().then(JSON.parse);
};
window.Response.prototype.clone = function() {
	return new window.Response(this._body.slice(0), this);
};

window.fetch = function( input, init ) {
	init = init || {};
	var url = typeof input === 'string' ? input : (input && input.url) || String(input);
	var isLocal = !/^[a-z][a-z0-9+.-]*:/i.test(url);

	return new Promise(function( resolve, reject ) {
		var xhr = new XMLHttpRequest();
		xhr.open((init.method || 'GET').toUpperCase(), url, true);
		xhr.responseType = 'arraybuffer';

		var headers = init.headers || {};
		for( var name in headers ) {
			xhr.setRequestHeader(name, headers[name]);
		}

		xhr.onload = function() {
			resolve(new window.Response(xhr.response, {
				status: xhr.status,
				statusText: String(xhr.status),
				url: url,
				headers: xhr.getAllResponseHeaders() || ''
			}));
		};
		xhr.onerror = xhr.ontimeout = function() {
			if( isLocal ) {
				resolve(new window.Response(null, {status: 404, statusText: 'Not Found', url: url}));
			}
			else {
				reject(new TypeError('Network request failed: ' + url));
			}
		};
		xhr.send(init.body === undefined ? null : init.body);
	});
};



// Web Audio API

// A subset that covers what games use: AudioContext, AudioBuffer,
// AudioBufferSourceNode, GainNode, StereoPannerNode, BiquadFilterNode,
// DelayNode, WaveShaperNode, DynamicsCompressorNode, ConvolverNode,
// AudioParam automation and decodeAudioData(). Ejecta.AudioMixer does the
// mixing and the effects natively.
//
// The graph isn't run node by node. Gains and stereo panners are folded into
// 2x2 matrices on the routes between sources, effect buses and the output.
// Each effect node is a bus in the mixer. Feedback loops through a delay
// work, one render block (128 frames) later than the delay time.
// AnalyserNode reports silence, and connecting to an AudioParam does nothing.

var audioMixer = null;
var audioSources = {}; // playing AudioBufferSourceNodes by voice id
var audioNextVoiceId = 1;
var audioNextBufferId = 1;
var audioNextBusId = 1;
var audioBufferRegistry = null;
var audioBusRegistry = null;
var audioBusRefs = new Set(); // WeakRefs to effect nodes with a bus

var getAudioMixer = function() {
	if( !audioMixer ) {
		audioMixer = new Ejecta.AudioMixer();
		audioMixer.onvoiceended = function( voiceId ) {
			var source = audioSources[voiceId];
			if( source ) {
				delete audioSources[voiceId];
				source._ended();
			}
		};
		// Free the native side of buffers and effect nodes once they are
		// garbage collected. A voice playing a buffer keeps its own copy.
		if( typeof FinalizationRegistry !== 'undefined' ) {
			audioBufferRegistry = new FinalizationRegistry(function( bufferId ) {
				audioMixer.deleteBuffer(bufferId);
			});
			audioBusRegistry = new FinalizationRegistry(function( busId ) {
				audioMixer.deleteBus(busId);
				audioMarkDirty();
			});
		}
	}
	return audioMixer;
};

var audioAsync = function( callback ) {
	Promise.resolve().then(callback);
};

var audioSameNumbers = function( a, b ) {
	if( !a || !b || a.length !== b.length ) { return false; }
	for( var i = 0; i < a.length; i++ ) {
		if( a[i] !== b[i] ) { return false; }
	}
	return true;
};

// Event target behaviour for contexts and source nodes
var audioEventTarget = function( proto ) {
	proto.addEventListener = function( type, callback ) {
		var listeners = (this._listeners = this._listeners || {});
		(listeners[type] = listeners[type] || []).push(callback);
	};
	proto.removeEventListener = function( type, callback ) {
		var list = this._listeners && this._listeners[type];
		var index = list ? list.indexOf(callback) : -1;
		if( index >= 0 ) { list.splice(index, 1); }
	};
	proto.dispatchEvent = function( event ) {
		event.target = event.currentTarget = this;
		var handler = this['on' + event.type];
		if( typeof handler === 'function' ) { handler.call(this, event); }
		var list = this._listeners && this._listeners[event.type];
		if( list ) {
			list = list.slice();
			for( var i = 0; i < list.length; i++ ) { list[i].call(this, event); }
		}
		return true;
	};
};


// Changes to the graph and to params are sent to the mixer once per frame.
// Params with a ramp running keep it going until the ramp ends.
var audioGraphDirty = false;
var audioGraphTimer = 0;
var audioAutomating = new Set();

var audioMarkDirty = function() {
	audioGraphDirty = true;
	if( !audioGraphTimer ) {
		audioGraphTimer = ej.setTimeout(audioFlush, 0);
	}
};

var audioFlush = function() {
	ej.clearTimeout(audioGraphTimer);
	audioGraphTimer = 0;
	audioAutomating.forEach(function( param ) {
		if( !param._automating() ) { audioAutomating.delete(param); }
	});
	if( audioMixer ) { audioCompile(); }
	audioGraphDirty = false;
	if( audioAutomating.size ) {
		audioGraphTimer = ej.setTimeout(audioFlush, 16);
	}
};


// Graph compiler
//
// A signal on its way through gains and panners is {mono, m}: for mono, m[0]
// is the gain on the one channel; for stereo, m is the 2x2 matrix from the
// left and right it started with to the current left and right.

var audioIdentity = function( mono ) {
	return mono ? {mono: true, m: [1, 0, 0, 0]} : {mono: false, m: [1, 0, 0, 1]};
};

// Follows a node's outputs through gains and panners to the effect buses and
// the destination it reaches. Calls arrive(target node, signal) for each.
var audioTrace = function( node, signal, arrive ) {
	var visit = function( n, s, depth ) {
		if( depth > 64 ) { return; } // a loop without an effect node
		if( n instanceof AudioDestinationNode || n._busType !== undefined ) {
			arrive(n, s);
			return;
		}
		s = n._process(s);
		for( var i = 0; i < n._outputs.length; i++ ) {
			visit(n._outputs[i], s, depth + 1);
		}
	};
	for( var i = 0; i < node._outputs.length; i++ ) {
		visit(node._outputs[i], signal, 1);
	}
};

// Routes as the mixer takes them: [target, m0, m1, m2, m3, ...]. Paths to
// the same target add up.
var audioRoutes = function( node, signal ) {
	var byTarget = new Map();
	audioTrace(node, signal, function( target, s ) {
		var id = target instanceof AudioDestinationNode ? 0 : target._busId;
		var m = s.m, mono = target instanceof AudioDestinationNode ? false : target._mono;
		var matrix = s.mono
			? (mono ? [m[0], 0, 0, 0] : [m[0], 0, m[0], 0])
			: m;
		var sum = byTarget.get(id);
		if( !sum ) { byTarget.set(id, matrix.slice()); }
		else { for( var i = 0; i < 4; i++ ) { sum[i] += matrix[i]; } }
	});
	var routes = [];
	byTarget.forEach(function( m, id ) {
		routes.push(id, m[0], m[1], m[2], m[3]);
	});
	return routes.slice(0, 16 * 5);
};

var audioBusOutput = function( bus ) {
	return audioIdentity(bus._mono && !bus._stereoOutput());
};

var audioCompile = function() {
	var mixer = audioMixer;

	// Live effect nodes
	var buses = [];
	audioBusRefs.forEach(function( ref ) {
		var node = ref.deref();
		if( node ) { buses.push(node); }
		else { audioBusRefs.delete(ref); }
	});
	var sources = [];
	for( var id in audioSources ) { sources.push(audioSources[id]); }

	// Which buses only ever get a mono signal. Start with all mono and turn
	// a bus stereo when anything stereo arrives, until nothing changes.
	buses.forEach(function( bus ) { bus._mono = true; });
	var markStereo = function( target, s ) {
		if( !s.mono && target._busType !== undefined && target._mono ) {
			target._mono = false;
			changed = true;
		}
	};
	var changed = true;
	for( var pass = 0; changed && pass <= buses.length + 1; pass++ ) {
		changed = false;
		sources.forEach(function( source ) { audioTrace(source, source._startSignal(), markStereo); });
		buses.forEach(function( bus ) { audioTrace(bus, audioBusOutput(bus), markStereo); });
	}

	// Buses, their settings and routes
	var edges = new Map();
	buses.forEach(function( bus ) {
		bus._sync(mixer);
		var routes = audioRoutes(bus, audioBusOutput(bus));
		if( !audioSameNumbers(routes, bus._pushedRoutes) ) {
			mixer.setBusRoutes(bus._busId, routes);
			bus._pushedRoutes = routes;
		}
		var targets = [];
		for( var i = 0; i < routes.length; i += 5 ) {
			if( routes[i] ) { targets.push(routes[i]); }
		}
		edges.set(bus._busId, targets);
	});

	// Run order: each bus before the buses it sends to, except around a
	// loop, where the feedback waits a block
	var order = [], state = new Map();
	var visit = function( id ) {
		if( state.has(id) ) { return; } // done, or on the path: a loop
		state.set(id, 1);
		(edges.get(id) || []).forEach(visit);
		order.push(id);
	};
	buses.forEach(function( bus ) { visit(bus._busId); });
	order.reverse();
	if( !audioSameNumbers(order, audioCompile._order) ) {
		mixer.setBusOrder(order);
		audioCompile._order = order;
	}

	// Playing sources
	sources.forEach(function( source ) { source._push(); });
};
audioCompile._order = null;


// AudioParam

var AudioParam = window.AudioParam = function( context, value, minValue, maxValue ) {
	this._context = context;
	this._value = value;
	this._events = [];
	this.defaultValue = value;
	this.minValue = minValue === undefined ? -3.4028234663852886e38 : minValue;
	this.maxValue = maxValue === undefined ? 3.4028234663852886e38 : maxValue;
	this.automationRate = 'a-rate';
};

AudioParam.prototype._valueAt = function( time ) {
	var value = this._value, prevTime = 0, events = this._events;
	for( var i = 0; i < events.length; i++ ) {
		var e = events[i];
		if( e.time > time ) {
			var t = (time - prevTime) / (e.time - prevTime);
			if( e.type === 'linear' ) {
				return value + (e.value - value) * t;
			}
			if( e.type === 'exponential' && value * e.value > 0 ) {
				return value * Math.pow(e.value / value, t);
			}
			return value;
		}
		value = e.value;
		prevTime = e.time;
	}
	return value;
};

AudioParam.prototype._automating = function() {
	var events = this._events;
	if( !events.length ) { return false; }
	var now = this._context.currentTime;
	if( events[events.length-1].time <= now ) {
		this._value = events[events.length-1].value;
		this._events = [];
		return false;
	}
	return true;
};

AudioParam.prototype._schedule = function( type, value, time ) {
	value = +value;
	if( !isFinite(value) || !isFinite(time) ) {
		throw new TypeError('AudioParam: value and time must be finite');
	}
	// Keep events in time order; one at the same time and type replaces
	var events = this._events, i = events.length;
	while( i > 0 && events[i-1].time > time ) { i--; }
	if( i > 0 && events[i-1].time === time && events[i-1].type === type ) {
		events[i-1].value = value;
	}
	else {
		events.splice(i, 0, {type: type, value: value, time: time});
	}
	audioAutomating.add(this);
	audioMarkDirty();
	return this;
};

Object.defineProperty(AudioParam.prototype, 'value', {
	get: function() {
		var value = this._events.length ? this._valueAt(this._context.currentTime) : this._value;
		return Math.min(Math.max(value, this.minValue), this.maxValue);
	},
	set: function( value ) {
		value = +value;
		if( !isFinite(value) ) {
			throw new TypeError('AudioParam: value must be finite');
		}
		this._events = [];
		this._value = value;
		audioMarkDirty();
	}
});

AudioParam.prototype.setValueAtTime = function( value, time ) {
	return this._schedule('set', value, Math.max(time, 0));
};
AudioParam.prototype.linearRampToValueAtTime = function( value, time ) {
	return this._schedule('linear', value, Math.max(time, 0));
};
AudioParam.prototype.exponentialRampToValueAtTime = function( value, time ) {
	return this._schedule('exponential', value, Math.max(time, 0));
};
AudioParam.prototype.setTargetAtTime = function( value, time, timeConstant ) {
	// Approximated as a linear ramp that arrives after 3 time constants (95%)
	time = Math.max(time, 0);
	this._schedule('set', this._valueAt(time), time);
	return this._schedule('linear', value, time + 3 * Math.max(timeConstant, 0));
};
AudioParam.prototype.setValueCurveAtTime = function( values, time, duration ) {
	time = Math.max(time, 0);
	for( var i = 0; i < values.length; i++ ) {
		this._schedule(i ? 'linear' : 'set', values[i], time + duration * i / Math.max(values.length - 1, 1));
	}
	return this;
};
AudioParam.prototype.cancelScheduledValues = function( time ) {
	this._events = this._events.filter(function( e ) { return e.time < time; });
	audioMarkDirty();
	return this;
};
AudioParam.prototype.cancelAndHoldAtTime = function( time ) {
	var value = this._valueAt(time);
	this.cancelScheduledValues(time);
	return this._schedule('set', value, time);
};


// AudioNode

var AudioNode = window.AudioNode = function( context, inputs, outputs ) {
	this.context = context;
	this.numberOfInputs = inputs === undefined ? 1 : inputs;
	this.numberOfOutputs = outputs === undefined ? 1 : outputs;
	this.channelCount = 2;
	this.channelCountMode = 'max';
	this.channelInterpretation = 'speakers';
	this._outputs = [];
};

AudioNode.prototype.connect = function( destination ) {
	if( destination instanceof AudioNode ) {
		if( this._outputs.indexOf(destination) < 0 ) {
			this._outputs.push(destination);
			audioMarkDirty();
		}
	}
	else if( !(destination instanceof AudioParam) ) {
		throw new TypeError('AudioNode.connect: not an AudioNode or AudioParam');
	}
	return destination;
};

AudioNode.prototype.disconnect = function( destination ) {
	if( destination instanceof AudioNode ) {
		var index = this._outputs.indexOf(destination);
		if( index < 0 ) {
			// As in browsers, which scripts rely on to tell if it was connected
			var error = new Error('InvalidAccessError: not connected to that node');
			error.name = 'InvalidAccessError';
			throw error;
		}
		this._outputs.splice(index, 1);
	}
	else if( !(destination instanceof AudioParam) ) {
		this._outputs = []; // disconnect() or disconnect(outputIndex)
	}
	audioMarkDirty();
};

// Pass through by default
AudioNode.prototype._process = function( signal ) {
	return signal;
};

var audioSubclass = function( name, parent, init, proto ) {
	var cls = window[name] = function( context, options ) {
		if( !(context instanceof BaseAudioContext) ) {
			throw new TypeError(name + ': the first argument must be an AudioContext');
		}
		parent.call(this, context, options);
		init.call(this, context, options || {});
	};
	cls.prototype = Object.create(parent.prototype);
	cls.prototype.constructor = cls;
	for( var key in proto || {} ) {
		Object.defineProperty(cls.prototype, key, Object.getOwnPropertyDescriptor(proto, key));
	}
	return cls;
};

var AudioDestinationNode = audioSubclass('AudioDestinationNode', AudioNode, function() {
	this.numberOfOutputs = 0;
	this.maxChannelCount = 2;
});

audioSubclass('GainNode', AudioNode, function( context, options ) {
	this.gain = new AudioParam(context, options.gain === undefined ? 1 : options.gain);
}, {
	_process: function( signal ) {
		var g = this.gain.value, m = signal.m;
		return {mono: signal.mono, m: [m[0]*g, m[1]*g, m[2]*g, m[3]*g]};
	}
});

audioSubclass('StereoPannerNode', AudioNode, function( context, options ) {
	this.pan = new AudioParam(context, options.pan === undefined ? 0 : options.pan, -1, 1);
}, {
	// Equal power panning, as the Web Audio spec defines it
	_process: function( signal ) {
		var pan = this.pan.value, m = signal.m;
		if( signal.mono ) {
			var x = (pan + 1) / 2;
			return {mono: false, m: [
				m[0] * Math.cos(x * Math.PI / 2), 0,
				m[0] * Math.sin(x * Math.PI / 2), 0
			]};
		}
		var x = pan <= 0 ? pan + 1 : pan;
		var gainL = Math.cos(x * Math.PI / 2), gainR = Math.sin(x * Math.PI / 2);
		if( pan <= 0 ) { // left gets all of left and some of right
			return {mono: false, m: [
				m[0] + m[2] * gainL, m[1] + m[3] * gainL,
				m[2] * gainR, m[3] * gainR
			]};
		}
		return {mono: false, m: [
			m[0] * gainL, m[1] * gainL,
			m[2] + m[0] * gainR, m[3] + m[1] * gainR
		]};
	}
});

audioSubclass('AnalyserNode', AudioNode, function( context, options ) {
	this.fftSize = options.fftSize || 2048;
	this.minDecibels = -100;
	this.maxDecibels = -30;
	this.smoothingTimeConstant = .8;
}, {
	// Reports silence: the mixed signal isn't available to JavaScript
	getByteFrequencyData: function( array ) { array.fill(0); },
	getFloatFrequencyData: function( array ) { array.fill(-Infinity); },
	getByteTimeDomainData: function( array ) { array.fill(128); },
	getFloatTimeDomainData: function( array ) { array.fill(0); },
	get frequencyBinCount() { return this.fftSize / 2; }
});


// Effect nodes: each is a bus in the mixer

var AudioEffectNode = function( context, options ) {
	AudioNode.call(this, context);
	this._busId = audioNextBusId++;
	this._mono = true;
	this._pushedBus = null;
	this._pushedParams = null;
	this._pushedRoutes = null;
	audioBusRefs.add(new WeakRef(this));
	getAudioMixer();
	if( audioBusRegistry ) { audioBusRegistry.register(this, this._busId); }
	audioMarkDirty();
};
AudioEffectNode.prototype = Object.create(AudioNode.prototype);

AudioEffectNode.prototype._maxDelay = function() { return 0; };
AudioEffectNode.prototype._params = function() { return []; };
AudioEffectNode.prototype._stereoOutput = function() { return false; };
AudioEffectNode.prototype._syncData = function() {};

// Sends the bus's type, input layout and parameters if they changed
AudioEffectNode.prototype._sync = function( mixer ) {
	var bus = [this._busType, this._maxDelay(), this._mono ? 1 : 0];
	if( !audioSameNumbers(bus, this._pushedBus) ) {
		var typeChanged = !this._pushedBus;
		mixer.setBus(this._busId, bus[0], bus[1], bus[2]);
		this._pushedBus = bus;
		if( typeChanged ) { this._dataDirty = true; }
	}
	var params = this._params();
	if( !audioSameNumbers(params, this._pushedParams) ) {
		mixer.setBusParams(this._busId, params);
		this._pushedParams = params;
	}
	if( this._dataDirty ) {
		this._syncData(mixer);
		this._dataDirty = false;
	}
};

var audioEffect = function( name, type, init, proto ) {
	var cls = audioSubclass(name, AudioEffectNode, init, proto);
	cls.prototype._busType = type;
	return cls;
};

var audioBiquadTypes = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'];

audioEffect('BiquadFilterNode', 1, function( context, options ) {
	this._type = audioBiquadTypes.indexOf(options.type) >= 0 ? options.type : 'lowpass';
	this.frequency = new AudioParam(context, options.frequency === undefined ? 350 : options.frequency, 0, context.sampleRate / 2);
	this.detune = new AudioParam(context, options.detune || 0);
	this.Q = new AudioParam(context, options.Q === undefined ? 1 : options.Q);
	this.gain = new AudioParam(context, options.gain || 0);
}, {
	get type() { return this._type; },
	set type( type ) {
		if( audioBiquadTypes.indexOf(type) >= 0 ) { this._type = type; audioMarkDirty(); }
	},
	_params: function() {
		return [audioBiquadTypes.indexOf(this._type), this.frequency.value, this.Q.value, this.gain.value, this.detune.value];
	},
	// Magnitude and phase of the filter as set now, at the given frequencies
	getFrequencyResponse: function( frequencies, magnitude, phase ) {
		var c = audioBiquadCoefficients(this._params(), this.context.sampleRate);
		for( var i = 0; i < frequencies.length; i++ ) {
			var f = frequencies[i];
			if( !(f >= 0 && f <= this.context.sampleRate / 2) ) {
				magnitude[i] = phase[i] = NaN;
				continue;
			}
			var w = 2 * Math.PI * f / this.context.sampleRate;
			var cos1 = Math.cos(w), sin1 = Math.sin(w), cos2 = Math.cos(2 * w), sin2 = Math.sin(2 * w);
			var nr = c[0] + c[1] * cos1 + c[2] * cos2, ni = -(c[1] * sin1 + c[2] * sin2);
			var dr = 1 + c[3] * cos1 + c[4] * cos2, di = -(c[3] * sin1 + c[4] * sin2);
			var d = dr * dr + di * di;
			var re = (nr * dr + ni * di) / d, im = (ni * dr - nr * di) / d;
			magnitude[i] = Math.sqrt(re * re + im * im);
			phase[i] = Math.atan2(im, re);
		}
	}
});

// The same coefficients as EJBiquadSetup() in EJAudioEffects.c: b0, b1, b2, a1, a2
var audioBiquadCoefficients = function( p, sampleRate ) {
	var type = p[0], nyquist = sampleRate / 2;
	var f0 = p[1] * Math.pow(2, p[4] / 1200), Q = p[2], gain = p[3];
	if( f0 >= nyquist ) {
		var b = (type === 1 || type === 2) ? 0 : type === 3 ? Math.pow(10, gain / 20) : 1;
		return [b, 0, 0, 0, 0];
	}
	if( f0 <= 0 ) {
		var b = (type === 0 || type === 2) ? 0 : type === 4 ? Math.pow(10, gain / 20) : 1;
		return [b, 0, 0, 0, 0];
	}
	var w0 = 2 * Math.PI * f0 / sampleRate, cos = Math.cos(w0), sin = Math.sin(w0);
	var A = Math.pow(10, gain / 40), q = Math.max(Q, 1e-4);
	var aQ = sin / (2 * q), aQdB = sin / (2 * Math.pow(10, Q / 20)), s = 2 * Math.sqrt(A) * sin / 2 * Math.SQRT2;
	var c;
	switch( type ) {
		case 0: c = [(1-cos)/2, 1-cos, (1-cos)/2, 1+aQdB, -2*cos, 1-aQdB]; break;
		case 1: c = [(1+cos)/2, -(1+cos), (1+cos)/2, 1+aQdB, -2*cos, 1-aQdB]; break;
		case 2: c = [aQ, 0, -aQ, 1+aQ, -2*cos, 1-aQ]; break;
		case 3: c = [A*((A+1)-(A-1)*cos+s), 2*A*((A-1)-(A+1)*cos), A*((A+1)-(A-1)*cos-s),
			(A+1)+(A-1)*cos+s, -2*((A-1)+(A+1)*cos), (A+1)+(A-1)*cos-s]; break;
		case 4: c = [A*((A+1)+(A-1)*cos+s), -2*A*((A-1)+(A+1)*cos), A*((A+1)+(A-1)*cos-s),
			(A+1)-(A-1)*cos+s, 2*((A-1)-(A+1)*cos), (A+1)-(A-1)*cos-s]; break;
		case 5: c = [1+aQ*A, -2*cos, 1-aQ*A, 1+aQ/A, -2*cos, 1-aQ/A]; break;
		case 6: c = [1, -2*cos, 1, 1+aQ, -2*cos, 1-aQ]; break;
		default: c = [1-aQ, -2*cos, 1+aQ, 1+aQ, -2*cos, 1-aQ]; break;
	}
	return [c[0]/c[3], c[1]/c[3], c[2]/c[3], c[4]/c[3], c[5]/c[3]];
};

audioEffect('DelayNode', 2, function( context, options ) {
	this._maxDelayTime = Math.min(Math.max(options.maxDelayTime || 1, 0), 180);
	this.delayTime = new AudioParam(context, options.delayTime || 0, 0, this._maxDelayTime);
}, {
	_maxDelay: function() { return this._maxDelayTime; },
	_params: function() { return [this.delayTime.value]; }
});

audioEffect('WaveShaperNode', 3, function( context, options ) {
	this._curve = null;
	this.oversample = options.oversample || 'none'; // not supported
	if( options.curve ) { this.curve = options.curve; }
}, {
	get curve() { return this._curve; },
	set curve( curve ) {
		this._curve = curve ? new Float32Array(curve) : null;
		this._dataDirty = true;
		audioMarkDirty();
	},
	_syncData: function( mixer ) {
		if( this._curve ) { mixer.setBusCurve(this._busId, this._curve); }
		else { mixer.setBusCurve(this._busId); }
	}
});

audioEffect('DynamicsCompressorNode', 4, function( context, options ) {
	this.threshold = new AudioParam(context, options.threshold === undefined ? -24 : options.threshold, -100, 0);
	this.knee = new AudioParam(context, options.knee === undefined ? 30 : options.knee, 0, 40);
	this.ratio = new AudioParam(context, options.ratio === undefined ? 12 : options.ratio, 1, 20);
	this.attack = new AudioParam(context, options.attack === undefined ? .003 : options.attack, 0, 1);
	this.release = new AudioParam(context, options.release === undefined ? .25 : options.release, 0, 1);
}, {
	get reduction() { return audioMixer ? audioMixer.getBusReduction(this._busId) : 0; },
	_params: function() {
		return [this.threshold.value, this.knee.value, this.ratio.value, this.attack.value, this.release.value];
	}
});

audioEffect('ConvolverNode', 5, function( context, options ) {
	this._buffer = null;
	this.normalize = !options.disableNormalization;
	if( options.buffer ) { this.buffer = options.buffer; }
}, {
	get buffer() { return this._buffer; },
	set buffer( buffer ) {
		if( buffer && !(buffer instanceof AudioBuffer) ) {
			throw new TypeError('ConvolverNode.buffer must be an AudioBuffer');
		}
		this._buffer = buffer || null;
		this._dataDirty = true;
		audioMarkDirty();
	},
	_stereoOutput: function() {
		return !!this._buffer && this._buffer.numberOfChannels > 1;
	},
	_syncData: function( mixer ) {
		var b = this._buffer;
		if( !b ) { return mixer.setBusImpulse(this._busId); }
		var channels = b._channels.slice(0, 2);
		var scale = 1;
		if( this.normalize ) {
			// Web Audio's normalization, so a reverb sounds about as loud as
			// the dry signal whatever the impulse's level
			var power = 0;
			for( var c = 0; c < b._channels.length; c++ ) {
				var data = b._channels[c];
				for( var i = 0; i < data.length; i++ ) { power += data[i] * data[i]; }
			}
			power = Math.sqrt(power / (b._channels.length * b.length));
			if( !isFinite(power) || power < 0.000125 ) { power = 0.000125; }
			scale = 1 / power * Math.pow(10, -58 * 0.05) * 44100 / b.sampleRate;
		}
		// The impulse must be at the mixer's rate; resample it if not
		if( b.sampleRate !== mixer.sampleRate ) {
			channels = channels.map(function( data ) {
				return audioResample(data, b.sampleRate, mixer.sampleRate);
			});
		}
		if( channels.length > 1 ) { mixer.setBusImpulse(this._busId, scale, channels[0], channels[1]); }
		else { mixer.setBusImpulse(this._busId, scale, channels[0]); }
	}
});

// Linear resampling, for impulse responses
var audioResample = function( data, fromRate, toRate ) {
	var length = Math.max(1, Math.round(data.length * toRate / fromRate));
	var out = new Float32Array(length), step = fromRate / toRate;
	for( var i = 0; i < length; i++ ) {
		var p = i * step, i0 = p | 0, t = p - i0;
		var a = data[i0] || 0, b = data[i0 + 1] || 0;
		out[i] = a + (b - a) * t;
	}
	return out;
};


// Source nodes

var AudioScheduledSourceNode = audioSubclass('AudioScheduledSourceNode', AudioNode, function() {
	this.numberOfInputs = 0;
	this.onended = null;
	this._state = 'idle'; // idle, scheduled, playing, ended
	this._startTimer = this._stopTimer = 0;
}, {
	start: function( when, offset, duration ) {
		if( this._state !== 'idle' ) {
			throw new Error('InvalidStateError: start() can only be called once');
		}
		this._state = 'scheduled';
		var self = this, delay = ((when || 0) - this.context.currentTime) * 1000;
		var begin = function() {
			self._startTimer = 0;
			if( self._state === 'scheduled' ) { self._begin(offset || 0); }
		};
		if( delay > 5 ) { this._startTimer = ej.setTimeout(begin, delay); }
		else { begin(); }
		if( duration !== undefined ) {
			this.stop((when || 0) + Math.max(delay, 0) / 1000 + duration);
		}
	},
	stop: function( when ) {
		if( this._state === 'idle' ) {
			throw new Error('InvalidStateError: stop() before start()');
		}
		var self = this, delay = ((when || 0) - this.context.currentTime) * 1000;
		ej.clearTimeout(this._stopTimer);
		var end = function() { self._stopTimer = 0; self._end(); };
		if( delay > 5 ) { this._stopTimer = ej.setTimeout(end, delay); }
		else { end(); }
	},
	_begin: function( offset ) {
		this._state = 'playing';
	},
	_end: function() {
		if( this._state === 'ended' ) { return; }
		ej.clearTimeout(this._startTimer);
		this._state = 'ended';
		var self = this;
		audioAsync(function() { self._ended(); });
	},
	_ended: function() {
		this._state = 'ended';
		this.dispatchEvent({type: 'ended'});
	}
});
audioEventTarget(AudioScheduledSourceNode.prototype);

var audioLoopProperty = function( name ) {
	return {
		get: function() { return this['_' + name]; },
		set: function( value ) { this['_' + name] = value; audioMarkDirty(); }
	};
};

var AudioBufferSourceNode = audioSubclass('AudioBufferSourceNode', AudioScheduledSourceNode, function( context, options ) {
	this.buffer = options.buffer || null;
	this.loop = !!options.loop;
	this.loopStart = options.loopStart || 0;
	this.loopEnd = options.loopEnd || 0;
	this.playbackRate = new AudioParam(context, options.playbackRate === undefined ? 1 : options.playbackRate);
	this.detune = new AudioParam(context, options.detune || 0);
	this._voice = 0;
	this._pushed = null;
}, {
	_startSignal: function() {
		return audioIdentity(!(this.buffer && this.buffer.numberOfChannels > 1));
	},
	_begin: function( offset ) {
		var buffer = this.buffer;
		var mixer = getAudioMixer();
		if( !buffer || !buffer.length ) {
			return this._end();
		}
		// Bring the graph up to date first, with this source in it
		var voice = audioNextVoiceId++;
		this._voice = voice;
		audioSources[voice] = this;
		audioFlush();
		var p = this._params();
		if( !mixer.play(voice, buffer._upload(mixer), offset, p[0], p[1], p[2], p[3], p[4]) ) {
			delete audioSources[voice];
			this._voice = 0;
			return this._end(); // every voice busy
		}
		this._state = 'playing';
		this._pushed = p;
	},
	_end: function() {
		if( this._voice ) {
			// The mixer reports the voice as ended, which fires 'ended'
			audioMixer.stop(this._voice);
			ej.clearTimeout(this._startTimer);
			return;
		}
		AudioScheduledSourceNode.prototype._end.call(this);
	},
	_ended: function() {
		this._voice = 0;
		AudioScheduledSourceNode.prototype._ended.call(this);
	},
	// [loop, loopStart, loopEnd, rate, routes] as the mixer takes them
	_params: function() {
		var rate = this.playbackRate.value * Math.pow(2, this.detune.value / 1200);
		return [this.loop, this.loopStart, this.loopEnd, rate, audioRoutes(this, this._startSignal())];
	},
	_push: function() {
		if( !this._voice || !this._pushed ) { return; }
		var p = this._params(), last = this._pushed;
		if( p[0] !== last[0] || p[1] !== last[1] || p[2] !== last[2] || p[3] !== last[3] ||
			!audioSameNumbers(p[4], last[4])
		) {
			audioMixer.update(this._voice, p[0], p[1], p[2], p[3], p[4]);
			this._pushed = p;
		}
	},
	get loop() { return this._loop; },
	set loop( loop ) { this._loop = !!loop; audioMarkDirty(); },
	get loopStart() { return this._loopStart; },
	set loopStart( value ) { this._loopStart = +value || 0; audioMarkDirty(); },
	get loopEnd() { return this._loopEnd; },
	set loopEnd( value ) { this._loopEnd = +value || 0; audioMarkDirty(); }
});

// Makes no sound; effect chains use it to keep nodes alive
audioSubclass('ConstantSourceNode', AudioScheduledSourceNode, function( context, options ) {
	this.offset = new AudioParam(context, options.offset === undefined ? 1 : options.offset);
});


// AudioBuffer

var AudioBuffer = window.AudioBuffer = function( options ) {
	options = options || {};
	var length = options.length | 0, channels = options.numberOfChannels || 1;
	if( length < 1 || !(options.sampleRate > 0) ) {
		throw new Error('NotSupportedError: AudioBuffer needs a length and sampleRate');
	}
	this.length = length;
	this.sampleRate = options.sampleRate;
	this.numberOfChannels = channels;
	this._channels = options._channels || [];
	for( var i = this._channels.length; i < channels; i++ ) {
		this._channels.push(new Float32Array(length));
	}
	this._id = 0;
	this._dirty = true;
};

Object.defineProperty(AudioBuffer.prototype, 'duration', {
	get: function() { return this.length / this.sampleRate; }
});

AudioBuffer.prototype.getChannelData = function( channel ) {
	if( !(channel >= 0 && channel < this.numberOfChannels) ) {
		throw new Error('IndexSizeError: no channel ' + channel);
	}
	this._dirty = true; // the caller may write to it
	return this._channels[channel];
};

AudioBuffer.prototype.copyFromChannel = function( destination, channel, start ) {
	start = start || 0;
	destination.set(this._channels[channel].subarray(start, start + destination.length));
};

AudioBuffer.prototype.copyToChannel = function( source, channel, start ) {
	this._channels[channel].set(source, start || 0);
	this._dirty = true;
};

// Copies the samples to the mixer if they changed; returns the buffer's id
AudioBuffer.prototype._upload = function( mixer ) {
	if( !this._id ) {
		this._id = audioNextBufferId++;
		if( audioBufferRegistry ) { audioBufferRegistry.register(this, this._id); }
	}
	if( this._dirty ) {
		var c = this._channels;
		if( c.length > 1 ) { mixer.setBuffer(this._id, this.sampleRate, c[0], c[1]); }
		else { mixer.setBuffer(this._id, this.sampleRate, c[0]); }
		this._dirty = false;
	}
	return this._id;
};


// AudioContext

var BaseAudioContext = window.BaseAudioContext = function() {
	this._mixer = getAudioMixer();
	this.state = 'running';
	this.onstatechange = null;
	this.listener = {};
	this.destination = new AudioDestinationNode(this);
};
audioEventTarget(BaseAudioContext.prototype);

Object.defineProperty(BaseAudioContext.prototype, 'currentTime', {
	get: function() { return this._mixer.currentTime; }
});
Object.defineProperty(BaseAudioContext.prototype, 'sampleRate', {
	get: function() { return this._mixer.sampleRate; }
});

BaseAudioContext.prototype.createGain = function() { return new window.GainNode(this); };
BaseAudioContext.prototype.createStereoPanner = function() { return new window.StereoPannerNode(this); };
BaseAudioContext.prototype.createBufferSource = function() { return new window.AudioBufferSourceNode(this); };
BaseAudioContext.prototype.createConstantSource = function() { return new window.ConstantSourceNode(this); };
BaseAudioContext.prototype.createBiquadFilter = function() { return new window.BiquadFilterNode(this); };
BaseAudioContext.prototype.createDelay = function( maxDelayTime ) { return new window.DelayNode(this, {maxDelayTime: maxDelayTime}); };
BaseAudioContext.prototype.createDynamicsCompressor = function() { return new window.DynamicsCompressorNode(this); };
BaseAudioContext.prototype.createConvolver = function() { return new window.ConvolverNode(this); };
BaseAudioContext.prototype.createWaveShaper = function() { return new window.WaveShaperNode(this); };
BaseAudioContext.prototype.createAnalyser = function() { return new window.AnalyserNode(this); };

BaseAudioContext.prototype.createBuffer = function( numberOfChannels, length, sampleRate ) {
	return new AudioBuffer({numberOfChannels: numberOfChannels, length: length, sampleRate: sampleRate});
};

BaseAudioContext.prototype.decodeAudioData = function( data, success, failure ) {
	var mixer = this._mixer;
	var promise = new Promise(function( resolve, reject ) {
		mixer.decode(data, function( sampleRate, channels ) {
			if( sampleRate === null ) {
				var error = new Error('EncodingError: ' + channels);
				error.name = 'EncodingError';
				return reject(error);
			}
			resolve(new AudioBuffer({
				length: channels[0].length,
				numberOfChannels: channels.length,
				sampleRate: sampleRate,
				_channels: channels
			}));
		});
	});
	if( success || failure ) {
		promise.then(success, failure);
	}
	return promise;
};

BaseAudioContext.prototype._setState = function( state ) {
	if( this.state === state ) { return; }
	this.state = state;
	var self = this;
	audioAsync(function() { self.dispatchEvent({type: 'statechange'}); });
};

// All contexts share one mixer, so suspending one suspends all of them
BaseAudioContext.prototype.resume = function() {
	if( this.state === 'closed' ) { return Promise.reject(new Error('InvalidStateError: closed')); }
	this._mixer.resume();
	this._setState('running');
	return Promise.resolve();
};
BaseAudioContext.prototype.suspend = function() {
	if( this.state === 'closed' ) { return Promise.reject(new Error('InvalidStateError: closed')); }
	this._mixer.suspend();
	this._setState('suspended');
	return Promise.resolve();
};
BaseAudioContext.prototype.close = function() {
	this._mixer.suspend();
	this._setState('closed');
	return Promise.resolve();
};

var AudioContext = window.AudioContext = window.webkitAudioContext = function( options ) {
	BaseAudioContext.call(this);
	this.baseLatency = 0.01;
	this.outputLatency = 0.02;
	this.latencyHint = (options && options.latencyHint) || 'interactive';
};
AudioContext.prototype = Object.create(BaseAudioContext.prototype);
AudioContext.prototype.constructor = AudioContext;

AudioContext.prototype.getOutputTimestamp = function() {
	return {contextTime: this.currentTime, performanceTime: ej.performanceNow()};
};


// WebGL 2

// getContext('webgl2') returns the canvas's WebGL 1 context wrapped by this,
// which adds the WebGL 2 calls that map onto WebGL 1 extensions: vertex array
// objects (OES_vertex_array_object) and instancing (ANGLE_instanced_arrays).
// GLSL ES 3.00 shaders are translated to GLSL ES 1.00, and attribute
// locations from layout(location=N) are kept with bindAttribLocation().
// That covers 2D engines like LittleJS. Not covered: integer textures, 3D and
// array textures, uniform buffers, transform feedback, multiple render
// targets, blitFramebuffer, and GLSL ES 3.00 features without a 1.00
// equivalent (integer bit operations, texelFetch, textureSize).

var glslHelpers = {
	round: 'float round(float x){return floor(x+.5);}vec2 round(vec2 x){return floor(x+.5);}' +
		'vec3 round(vec3 x){return floor(x+.5);}vec4 round(vec4 x){return floor(x+.5);}',
	trunc: 'float trunc(float x){return sign(x)*floor(abs(x));}vec2 trunc(vec2 x){return sign(x)*floor(abs(x));}' +
		'vec3 trunc(vec3 x){return sign(x)*floor(abs(x));}vec4 trunc(vec4 x){return sign(x)*floor(abs(x));}'
};

// Returns {source, attributes: [{name, location}]}. Sources that aren't
// "#version 300 es" are returned as they are.
var glslTranslate = window.__ejectaTranslateGLSL = function( source, isVertex ) {
	source = String(source);
	var attributes = [];
	if( !/^\s*#version\s+300\s+es\b/.test(source) ) {
		return {source: source, attributes: attributes};
	}

	// Comments out, keeping line breaks so error line numbers still match
	var s = source
		.replace(/\/\*[\s\S]*?\*\//g, function( c ) { return c.replace(/[^\n]/g, ' '); })
		.replace(/\/\/[^\n]*/g, '')
		.replace(/^\s*#version\s+300\s+es\b[^\n]*/, '');

	// layout(location = N) on vertex inputs: remember for bindAttribLocation
	s = s.replace(/layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*(in|out)\b([^;]*);/g, function( m, location, qualifier, rest ) {
		if( isVertex && qualifier === 'in' ) {
			var names = rest.replace(/\b(highp|mediump|lowp|flat|smooth)\b/g, '').trim().split(/\s+/).slice(1).join(' ').split(',');
			names.forEach(function( name, i ) {
				attributes.push({name: name.trim().replace(/\[.*$/, ''), location: +location + i});
			});
		}
		return qualifier + rest + ';';
	});

	// Interpolation qualifiers don't exist in 1.00
	s = s.replace(/\b(flat|smooth|centroid)\s+(?=(in|out|highp|mediump|lowp|\w+\s+\w))/g, '');

	// Global in/out declarations start a statement; parameters don't
	var outputs = [];
	// (the ; is left for the next match to start from: no lookbehind before iOS 16.4)
	s = s.replace(/(^|[;{}\n])(\s*)(in|out)\s+((?:highp|mediump|lowp)\s+)?(\w+)\s+([^;]+)(?=;)/g,
		function( m, before, space, qualifier, precision, type, names ) {
			precision = precision || '';
			if( qualifier === 'in' ) {
				return before + space + (isVertex ? 'attribute ' : 'varying ') + precision + type + ' ' + names;
			}
			if( isVertex ) {
				return before + space + 'varying ' + precision + type + ' ' + names;
			}
			// A fragment output becomes a global that main() copies out
			outputs.push(names.split(',')[0].trim());
			return before + space + precision + type + ' ' + names;
		});

	// texture() picks texture2D or textureCube by the sampler's type
	var cubes = {};
	s.replace(/uniform\s+(?:(?:highp|mediump|lowp)\s+)?samplerCube\s+([^;]+);/g, function( m, names ) {
		names.split(',').forEach(function( n ) { cubes[n.trim()] = true; });
	});
	s = s.replace(/\btexture\s*\(\s*(\w+)/g, function( m, sampler ) {
		return (cubes[sampler] ? 'textureCube(' : 'texture2D(') + sampler;
	});

	if( !isVertex && outputs.length ) {
		s = s.replace(/\bvoid\s+main\s*\(/, 'void ejectaMain(');
		s += '\nvoid main(){ejectaMain();gl_FragColor=vec4(' + outputs[0] + ');}\n';
	}

	// Functions 3.00 has and 1.00 doesn't, after the precision statement
	var helpers = '';
	for( var name in glslHelpers ) {
		if( new RegExp('\\b' + name + '\\s*\\(').test(s) ) { helpers += glslHelpers[name]; }
	}
	var precision = /precision\s+(highp|mediump|lowp)\s+float\s*;/.exec(s);
	if( !precision && !isVertex ) {
		s = 'precision mediump float;' + s;
		precision = /precision\s+(highp|mediump|lowp)\s+float\s*;/.exec(s);
	}
	if( helpers ) {
		var at = precision ? precision.index + precision[0].length : 0;
		s = s.slice(0, at) + helpers + s.slice(at);
	}
	return {source: s, attributes: attributes};
};

window.__ejectaMakeWebGL2 = function( gl ) {
	var vao = gl.getExtension('OES_vertex_array_object');
	var instancing = gl.getExtension('ANGLE_instanced_arrays');
	if( !vao || !instancing ) {
		console.warn('WebGL 2 needs OES_vertex_array_object and ANGLE_instanced_arrays');
		return null;
	}
	gl.getExtension('OES_element_index_uint'); // core in WebGL 2
	gl.getExtension('OES_standard_derivatives');

	var shaderInfo = new WeakMap();      // shader -> {source, isVertex, attributes}
	var programShaders = new WeakMap();  // program -> [shaders]
	var boundVertexArray = null;

	// WebGL 2 sized internal formats as their WebGL 1 formats
	var sizedFormats = {};
	sizedFormats[0x8058] = gl.RGBA;      // RGBA8
	sizedFormats[0x8051] = gl.RGB;       // RGB8
	sizedFormats[0x8C43] = gl.RGBA;      // SRGB8_ALPHA8
	var webglFormat = function( internalformat ) {
		return sizedFormats[internalformat] || internalformat;
	};

	var extra = {
		// Vertex array objects
		createVertexArray: function() { return vao.createVertexArrayOES(); },
		deleteVertexArray: function( v ) {
			if( v && v === boundVertexArray ) { boundVertexArray = null; }
			vao.deleteVertexArrayOES(v);
		},
		isVertexArray: function( v ) { return vao.isVertexArrayOES(v); },
		bindVertexArray: function( v ) { boundVertexArray = v || null; vao.bindVertexArrayOES(v || null); },

		// Instancing
		vertexAttribDivisor: function( index, divisor ) { instancing.vertexAttribDivisorANGLE(index, divisor); },
		drawArraysInstanced: function( mode, first, count, instances ) {
			instancing.drawArraysInstancedANGLE(mode, first, count, instances);
		},
		drawElementsInstanced: function( mode, count, type, offset, instances ) {
			instancing.drawElementsInstancedANGLE(mode, count, type, offset, instances);
		},

		// Shaders: translate 3.00 to 1.00 and keep attribute locations
		shaderSource: function( shader, source ) {
			var isVertex = gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.VERTEX_SHADER;
			var translated = glslTranslate(source, isVertex);
			shaderInfo.set(shader, {source: String(source), attributes: translated.attributes});
			gl.shaderSource(shader, translated.source);
		},
		getShaderSource: function( shader ) {
			var info = shaderInfo.get(shader);
			return info ? info.source : gl.getShaderSource(shader);
		},
		attachShader: function( program, shader ) {
			var list = programShaders.get(program) || [];
			if( list.indexOf(shader) < 0 ) { list.push(shader); }
			programShaders.set(program, list);
			gl.attachShader(program, shader);
		},
		detachShader: function( program, shader ) {
			var list = programShaders.get(program) || [];
			var index = list.indexOf(shader);
			if( index >= 0 ) { list.splice(index, 1); }
			gl.detachShader(program, shader);
		},
		linkProgram: function( program ) {
			(programShaders.get(program) || []).forEach(function( shader ) {
				var info = shaderInfo.get(shader);
				(info ? info.attributes : []).forEach(function( a ) {
					gl.bindAttribLocation(program, a.location, a.name);
				});
			});
			gl.linkProgram(program);
		},

		// Textures with sized formats
		texImage2D: function( target, level, internalformat ) {
			var args = Array.prototype.slice.call(arguments);
			args[2] = webglFormat(internalformat);
			return gl.texImage2D.apply(gl, args);
		},
		texStorage2D: function( target, levels, internalformat, width, height ) {
			var format = webglFormat(internalformat);
			for( var level = 0; level < levels; level++ ) {
				gl.texImage2D(target, level, format, Math.max(1, width >> level), Math.max(1, height >> level),
					0, format, gl.UNSIGNED_BYTE, null);
			}
		},

		// Samplers: accepted, but textures keep their own parameters
		createSampler: function() { return {}; },
		deleteSampler: function() {},
		isSampler: function( s ) { return !!s; },
		bindSampler: function() {},
		samplerParameteri: function() {},
		samplerParameterf: function() {},

		drawBuffers: function( buffers ) {
			if( buffers.length > 1 ) { console.warn('drawBuffers: only one color attachment is supported'); }
		},

		getParameter: function( pname ) {
			if( pname === 0x1F02 ) { return 'WebGL 2.0 (Ejecta, on WebGL 1)'; }   // VERSION
			if( pname === 0x8B8C ) { return 'WebGL GLSL ES 3.00 (Ejecta)'; }      // SHADING_LANGUAGE_VERSION
			if( pname === 0x85B5 ) { return boundVertexArray; }                    // VERTEX_ARRAY_BINDING
			if( pname === 0x8D57 ) { return 4; }                                   // MAX_SAMPLES
			return gl.getParameter(pname);
		},

		// WebGL 2 constants that WebGL 1 doesn't define
		VERTEX_ARRAY_BINDING: 0x85B5, VERTEX_ATTRIB_ARRAY_DIVISOR: 0x88FE,
		RGBA8: 0x8058, RGB8: 0x8051, SRGB8_ALPHA8: 0x8C43, R8: 0x8229, RG8: 0x822B, RED: 0x1903, RG: 0x8227,
		HALF_FLOAT: 0x140B, RGBA16F: 0x881A, RGBA32F: 0x8814, R16F: 0x822D, R32F: 0x822E,
		DEPTH_COMPONENT24: 0x81A6, DEPTH24_STENCIL8: 0x88F0, DEPTH_COMPONENT32F: 0x8CAC,
		READ_FRAMEBUFFER: 0x8CA8, DRAW_FRAMEBUFFER: 0x8CA9, MAX_SAMPLES: 0x8D57,
		COLOR_ATTACHMENT1: 0x8CE1, COLOR_ATTACHMENT2: 0x8CE2, COLOR_ATTACHMENT3: 0x8CE3,
		TEXTURE_3D: 0x806F, TEXTURE_2D_ARRAY: 0x8C1A, TEXTURE_WRAP_R: 0x8072,
		TEXTURE_MIN_LOD: 0x813A, TEXTURE_MAX_LOD: 0x813B, TEXTURE_BASE_LEVEL: 0x813C, TEXTURE_MAX_LEVEL: 0x813D,
		UNIFORM_BUFFER: 0x8A11, PIXEL_PACK_BUFFER: 0x88EB, PIXEL_UNPACK_BUFFER: 0x88EC,
		COPY_READ_BUFFER: 0x8F36, COPY_WRITE_BUFFER: 0x8F37,
		MIN: 0x8007, MAX: 0x8008, STREAM_READ: 0x88E1, STATIC_READ: 0x88E5, DYNAMIC_READ: 0x88E9
	};

	var bound = new Map();
	return new Proxy(gl, {
		get: function( target, prop ) {
			if( prop in extra ) { return extra[prop]; }
			var value = target[prop];
			if( typeof value !== 'function' ) { return value; }
			// Native WebGL calls need the native context as `this`
			var fn = bound.get(prop);
			if( !fn ) { fn = value.bind(target); bound.set(prop, fn); }
			return fn;
		},
		set: function( target, prop, value ) {
			target[prop] = value;
			return true;
		},
		has: function( target, prop ) {
			return prop in extra || prop in target;
		}
	});
};


})(this);
