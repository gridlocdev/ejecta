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

// A subset that covers what 2D game engines use: AudioContext, AudioBuffer,
// AudioBufferSourceNode, GainNode, StereoPannerNode, AudioParam automation
// and decodeAudioData(). Samples are mixed natively by Ejecta.AudioMixer.
//
// The graph is not run node by node. For each playing source, the gains and
// panners on its paths to the destination are folded into one 2x2 matrix and
// a rate, which the mixer applies. Filter, delay, compressor, convolver and
// wave shaper nodes can be created and connected, but pass sound through
// unchanged. Connecting a node to an AudioParam has no effect.

var audioMixer = null;
var audioSources = {}; // playing AudioBufferSourceNodes by voice id
var audioNextVoiceId = 1;
var audioNextBufferId = 1;
var audioBufferRegistry = null;

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
		// Free the native copy of an AudioBuffer's samples once the buffer
		// is garbage collected. A voice playing them keeps its own reference.
		if( typeof FinalizationRegistry !== 'undefined' ) {
			audioBufferRegistry = new FinalizationRegistry(function( bufferId ) {
				audioMixer.deleteBuffer(bufferId);
			});
		}
	}
	return audioMixer;
};

var audioAsync = function( callback ) {
	Promise.resolve().then(callback);
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


// Changes to gains, pans, rates and connections are pushed to the mixer once
// per frame. Params with a ramp running keep it going until the ramp ends.
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
	audioGraphTimer = 0;
	audioAutomating.forEach(function( param ) {
		if( !param._automating() ) { audioAutomating.delete(param); }
	});
	for( var id in audioSources ) {
		audioSources[id]._push();
	}
	audioGraphDirty = false;
	if( audioAutomating.size ) {
		audioGraphTimer = ej.setTimeout(audioFlush, 16);
	}
};


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
		return this._events.length ? this._valueAt(this._context.currentTime) : this._value;
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
//
// A signal on its way to the destination is {mono, m}: for mono, m[0] is
// the gain on the one channel; for stereo, m is the 2x2 matrix from the
// buffer's left and right to the current left and right.

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
		if( index >= 0 ) { this._outputs.splice(index, 1); }
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
		parent.call(this, context);
		init.call(this, context, options || {});
	};
	cls.prototype = Object.create(parent.prototype);
	cls.prototype.constructor = cls;
	for( var key in proto || {} ) { cls.prototype[key] = proto[key]; }
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
		var pan = Math.min(Math.max(this.pan.value, -1), 1), m = signal.m;
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

// Accepted so effect chains can be built, but they pass sound through as is
audioSubclass('BiquadFilterNode', AudioNode, function( context, options ) {
	this.type = options.type || 'lowpass';
	this.frequency = new AudioParam(context, options.frequency === undefined ? 350 : options.frequency);
	this.detune = new AudioParam(context, options.detune || 0);
	this.Q = new AudioParam(context, options.Q === undefined ? 1 : options.Q);
	this.gain = new AudioParam(context, options.gain || 0);
}, {
	getFrequencyResponse: function( frequencies, magnitude, phase ) {
		magnitude.fill(1);
		phase.fill(0);
	}
});
audioSubclass('DelayNode', AudioNode, function( context, options ) {
	this.delayTime = new AudioParam(context, options.delayTime || 0, 0, options.maxDelayTime || 1);
});
audioSubclass('DynamicsCompressorNode', AudioNode, function( context, options ) {
	this.threshold = new AudioParam(context, options.threshold === undefined ? -24 : options.threshold);
	this.knee = new AudioParam(context, options.knee === undefined ? 30 : options.knee);
	this.ratio = new AudioParam(context, options.ratio === undefined ? 12 : options.ratio);
	this.attack = new AudioParam(context, options.attack === undefined ? .003 : options.attack);
	this.release = new AudioParam(context, options.release === undefined ? .25 : options.release);
	this.reduction = 0;
});
audioSubclass('ConvolverNode', AudioNode, function( context, options ) {
	this.buffer = options.buffer || null;
	this.normalize = !options.disableNormalization;
});
audioSubclass('WaveShaperNode', AudioNode, function( context, options ) {
	this.curve = options.curve || null;
	this.oversample = options.oversample || 'none';
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
	getFloatTimeDomainData: function( array ) { array.fill(0); }
});
Object.defineProperty(window.AnalyserNode.prototype, 'frequencyBinCount', {
	get: function() { return this.fftSize / 2; }
});


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

var AudioBufferSourceNode = audioSubclass('AudioBufferSourceNode', AudioScheduledSourceNode, function( context, options ) {
	this.buffer = options.buffer || null;
	this.loop = !!options.loop;
	this.loopStart = options.loopStart || 0; // not supported: loops play the whole buffer
	this.loopEnd = options.loopEnd || 0;
	this.playbackRate = new AudioParam(context, options.playbackRate === undefined ? 1 : options.playbackRate);
	this.detune = new AudioParam(context, options.detune || 0);
	this._voice = 0;
	this._pushed = null;
}, {
	_begin: function( offset ) {
		var buffer = this.buffer;
		var mixer = getAudioMixer();
		if( !buffer || !buffer.length ) {
			return this._end();
		}
		var voice = audioNextVoiceId++;
		var p = this._params();
		if( !mixer.play(voice, buffer._upload(mixer), offset, p[0], p[1], p[2], p[3], p[4], p[5]) ) {
			return this._end(); // every voice busy
		}
		this._state = 'playing';
		this._voice = voice;
		this._pushed = p;
		audioSources[voice] = this;
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
	// [loop, rate, m0, m1, m2, m3] as the mixer takes them
	_params: function() {
		var stereo = this.buffer && this.buffer.numberOfChannels > 1;
		var total = [0, 0, 0, 0];
		var visit = function( node, signal, depth ) {
			if( depth > 32 ) { return; } // a cycle
			if( node instanceof AudioDestinationNode ) {
				var m = signal.m;
				if( signal.mono ) { m = [m[0], 0, m[0], 0]; }
				for( var i = 0; i < 4; i++ ) { total[i] += m[i]; }
				return;
			}
			signal = node._process(signal);
			for( var i = 0; i < node._outputs.length; i++ ) {
				visit(node._outputs[i], signal, depth + 1);
			}
		};
		var start = stereo ? {mono: false, m: [1, 0, 0, 1]} : {mono: true, m: [1, 0, 0, 0]};
		for( var i = 0; i < this._outputs.length; i++ ) {
			visit(this._outputs[i], start, 1);
		}
		var rate = this.playbackRate.value * Math.pow(2, this.detune.value / 1200);
		return [this.loop, rate, total[0], total[1], total[2], total[3]];
	},
	_push: function() {
		if( !this._voice ) { return; }
		var p = this._params(), last = this._pushed;
		for( var i = 0; i < 6; i++ ) {
			if( p[i] !== last[i] ) {
				audioMixer.update(this._voice, p[0], p[1], p[2], p[3], p[4], p[5]);
				this._pushed = p;
				return;
			}
		}
	}
});
Object.defineProperty(AudioBufferSourceNode.prototype, 'loop', {
	get: function() { return this._loop; },
	set: function( loop ) { this._loop = !!loop; audioMarkDirty(); }
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
		// The native side reads typed arrays from the start of their
		// ArrayBuffer, so hand it arrays that begin there
		var c = this._channels.map(function( channel ) {
			return channel.byteOffset === 0 ? channel : new Float32Array(channel);
		});
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
	if( ArrayBuffer.isView(data) ) {
		data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
	}
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


})(this);
