#!/usr/bin/env node
// Ejecta API simulator.
//
// Runs an Ejecta App folder in Node against stand-ins for Ejecta's native
// classes, and reports every property a script reads that real Ejecta does
// not provide. Use it to find browser APIs a web game expects before you
// build for the Apple TV.
//
// The member lists are parsed from the EJ_BIND_* macros in Source/, so the
// report follows whatever this copy of Ejecta actually binds. Nothing is
// drawn: canvas calls are only counted.
//
// Usage: node tools/ejecta-sim/sim.mjs [AppDir=App] [seconds=5] [--lenient]
//
// --lenient hands back a no-op function for a missing native member instead of
// undefined, so a run goes on past the first gap and lists all of them.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const lenient = process.argv.includes('--lenient');
const appDir = path.resolve(args[0] || path.join(root, 'App'));
const seconds = Number(args[1] || 5);
const SCREEN = {width: 1920, height: 1080, scale: 1};

// --- Parse the bindings -----------------------------------------------------

const sourceFiles = [];
(function walk(dir) {
	for (const f of fs.readdirSync(dir, {withFileTypes: true})) {
		const p = path.join(dir, f.name);
		if (f.isDirectory()) walk(p);
		else if (/\.[hm]$/.test(f.name)) sourceFiles.push(p);
	}
})(path.join(root, 'Source'));

const superOf = {}, membersOf = {};
// EJ_BIND_CONST(name, value): a string or number literal, or a C constant.
function constValue(arg) {
	const v = arg.trim().replace(/^@/, '');
	if (/^".*"$/.test(v)) return JSON.parse(v);
	return /^-?[\d.]+$/.test(v) ? Number(v) : 0;
}
for (const file of sourceFiles) {
	const src = fs.readFileSync(file, 'utf8');
	for (const m of src.matchAll(/@interface\s+(EJBinding\w+)\s*:\s*(\w+)/g))
		superOf[m[1]] = m[2];
	if (!file.endsWith('.m')) continue;
	for (const impl of src.split('@implementation').slice(1)) {
		const name = impl.match(/^\s*(\w+)/)[1];
		const members = membersOf[name] ||= {};
		for (const m of impl.matchAll(/EJ_BIND_(\w+)\(\s*(\w+)(?:\s*,\s*([^)]*))?/g)) {
			const [, kind, prop, arg] = m;
			if (kind === 'CONST') members[prop] = {value: constValue(arg)};
			else if (kind === 'EVENT') members['on' + prop] = 'prop';
			else if (kind === 'FUNCTION') members[prop] = 'function';
			else if (kind === 'FUNCTION_NOT_IMPLEMENTED') members[prop] = 'notImplemented';
			else members[prop] ??= 'prop';
		}
	}
}
// Every evented binding gets these from EJBindingEventedBase.
function bindingMembers(cls) {
	const all = {};
	for (let c = cls; c && c !== 'NSObject'; c = superOf[c])
		for (const [k, v] of Object.entries(membersOf[c] || {})) all[k] ??= v;
	return all;
}

// --- Missing member tracking ------------------------------------------------

const missing = new Map(); // "Type.prop" -> count
const notImplemented = new Map();
const ignore = new Set(['then', 'toJSON', 'constructor', 'valueOf', 'toString',
	'nodeType', 'asymmetricMatch', '$$typeof', 'inspect']);
function noteMissing(type, prop) {
	if (typeof prop !== 'string' || ignore.has(prop) || prop[0] === '_') return;
	const key = `${type}.${prop}`;
	missing.set(key, (missing.get(key) || 0) + 1);
}
// A prototype that reports reads of anything not on the object or its chain.
function watchedProto(type, proto, native = true) {
	return new Proxy(proto, {
		get(target, prop, receiver) {
			if (!(prop in target)) {
				noteMissing(type, prop);
				if (lenient && native && typeof prop === 'string' && prop[0] !== '_' && !ignore.has(prop))
					return function () {};
			}
			return Reflect.get(target, prop, receiver);
		}
	});
}

const calls = {};
const count = (name) => calls[name] = (calls[name] || 0) + 1;

// Build a class standing in for Ejecta.<jsName>, with the bound members as
// no-ops or plain values, overridden by `impl`.
function nativeClass(jsName, impl = {}, init) {
	const cls = 'EJBinding' + jsName;
	const members = bindingMembers(cls);
	const proto = {};
	for (const [prop, kind] of Object.entries(members)) {
		if (prop in impl) continue;
		if (kind === 'function')
			proto[prop] = function () { count(`${jsName}.${prop}`); };
		else if (typeof kind === 'object')
			proto[prop] = kind.value;
		else if (kind === 'prop')
			proto[prop] = undefined;
		else if (kind === 'notImplemented')
			proto[prop] = function () {
				const key = `${jsName}.${prop}`;
				notImplemented.set(key, (notImplemented.get(key) || 0) + 1);
			};
	}
	Object.defineProperties(proto, Object.getOwnPropertyDescriptors(impl));
	if ('addEventListener' in members && !('addEventListener' in impl)) {
		proto.addEventListener = function (type, cb) {
			((this._listeners ||= {})[type] ||= []).push(cb);
		};
		proto.removeEventListener = function (type, cb) {
			const l = this._listeners?.[type];
			l && l.splice(l.indexOf(cb) >>> 0, 1);
		};
	}
	proto._dispatch = function (type, ev = {}) {
		ev.type = type; ev.target = ev.currentTarget = this;
		this['on' + type]?.(ev);
		for (const cb of this._listeners?.[type] || []) cb(ev);
	};
	const C = function (...args) { init?.call(this, ...args); };
	C.prototype = watchedProto(jsName, proto);
	return C;
}

// --- Timers on a virtual clock ----------------------------------------------

let now = 0, nextTimer = 1;
const timers = new Map();
function addTimer(cb, t, repeat) {
	const id = nextTimer++;
	timers.set(id, {cb, at: now + Math.max(t, 1), every: repeat ? Math.max(t, 1) : 0});
	return id;
}

// --- Images: read PNG/JPEG size from file or data URI ------------------------

function imageSize(buf) {
	if (buf.slice(1, 4).toString() === 'PNG')
		return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
	for (let i = 2; i < buf.length;) { // JPEG SOF marker
		const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
		if (marker >= 0xC0 && marker <= 0xC3)
			return {width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5)};
		i += 2 + len;
	}
	return null;
}
function loadBytes(src) {
	const data = /^data:[^,]*?(;base64)?,(.*)$/s.exec(src);
	if (data) return Buffer.from(decodeURIComponent(data[2]), data[1] ? 'base64' : 'utf8');
	const file = path.join(appDir, src);
	return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

// --- The Ejecta namespace ---------------------------------------------------

const context = vm.createContext({});
const run = (code, file) => vm.runInContext(code, context, {filename: file});
const errors = [];

let screenCanvasMade = false;
const Context2D = nativeClass('CanvasContext2D', {
	measureText(t) { count('CanvasContext2D.measureText'); return {width: String(t).length * 10}; },
	getImageData(x, y, w, h) {
		count('CanvasContext2D.getImageData');
		return {width: w, height: h, data: new Uint8ClampedArray(w * h * 4)};
	},
	createImageData(w, h) { return {width: w, height: h, data: new Uint8ClampedArray(w * h * 4)}; },
	createLinearGradient() { return {addColorStop() {}}; },
	createRadialGradient() { return {addColorStop() {}}; },
	createPattern() { return {}; },
}, function (canvas) { this.canvas = canvas; });
for (const k of ['fillStyle', 'strokeStyle']) Context2D.prototype[k] = '#000';

const Canvas = nativeClass('Canvas', {
	getContext(type) {
		count('Canvas.getContext:' + type);
		if (type === '2d') return this._ctx ||= new Context2D(this);
		if (/webgl2/.test(type)) return undefined; // matches EJBindingCanvas.m
		if (/webgl/.test(type)) { noteMissing('sim', 'WebGL is not simulated'); return undefined; }
	},
	toDataURL() { return 'data:image/png;base64,'; },
}, function () {
	this.isScreenCanvas = !screenCanvasMade;
	screenCanvasMade = true;
	this.width = this.isScreenCanvas ? SCREEN.width : 300;
	this.height = this.isScreenCanvas ? SCREEN.height : 150;
	this.style = new CanvasStyle();
	this.offsetLeft = this.offsetTop = 0;
	this.offsetWidth = SCREEN.width; this.offsetHeight = SCREEN.height;
});
const CanvasStyle = nativeClass('CanvasStyle');

const Image = nativeClass('Image', {
	get src() { return this._src; },
	set src(v) {
		this._src = v;
		this.complete = false;
		const bytes = loadBytes(String(v));
		addTimer(() => {
			const size = bytes && imageSize(bytes);
			if (!size) {
				errors.push(`Image failed to load: ${String(v).slice(0, 80)}`);
				return this._dispatch('error');
			}
			Object.assign(this, size, {naturalWidth: size.width, naturalHeight: size.height, complete: true});
			this._dispatch('load');
		}, 1);
	},
}, function () { this.width = this.height = 0; });

const storage = {};
const LocalStorage = nativeClass('LocalStorage', {
	getItem(k) { return k in storage ? storage[k] : null; },
	setItem(k, v) { storage[k] = String(v); },
	removeItem(k) { delete storage[k]; },
	clear() { for (const k in storage) delete storage[k]; },
	key(i) { return Object.keys(storage)[i] ?? null; },
	get length() { return Object.keys(storage).length; },
});

const HttpRequest = nativeClass('HttpRequest', {
	open(method, url) { this._url = url; this.readyState = 1; },
	send() {
		addTimer(() => {
			const bytes = loadBytes(this._url);
			this.status = bytes ? 200 : 404;
			this.responseText = bytes ? bytes.toString('utf8') : '';
			this.response = this.responseType === 'arraybuffer' && bytes
				? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
				: this.responseText;
			this.readyState = 4;
			this._dispatch('readystatechange');
			this._dispatch('load');
		}, 1);
	},
});

// One connected Siri Remote style controller, so gamepad code paths run.
const GamepadButton = nativeClass('GamepadButton', {}, function () { this.pressed = false; this.value = 0; });
const Gamepad = nativeClass('Gamepad', {}, function () {
	Object.assign(this, {id: 'Siri Remote (sim)', profile: 'microGamepad', index: 0, connected: true,
		mapping: 'standard', axes: [0, 0], timestamp: 0, exitOnMenuPress: true});
	this.buttons = Array.from({length: 17}, () => new GamepadButton());
});
let simGamepads;
const GamepadProvider = nativeClass('GamepadProvider', {
	getGamepads() { return simGamepads ||= [new Gamepad()]; }
});

const GlobalUtils = nativeClass('GlobalUtils', {
	devicePixelRatio: SCREEN.scale,
	screenWidth: SCREEN.width,
	screenHeight: SCREEN.height,
	language: 'en', userAgent: 'Ejecta tvOS (sim)', appVersion: '1.0',
	platform: 'AppleTV', onLine: true, orientation: 0,
	log(s) { console.log('  [log] ' + s); },
	performanceNow() { return now; },
	setTimeout(cb, t) { return addTimer(cb, t, false); },
	setInterval(cb, t) { return addTimer(cb, t, true); },
	clearTimeout(id) { timers.delete(id); },
	clearInterval(id) { timers.delete(id); },
	include(file) { includeFile(file); },
	requireModule(id, module, exports) {
		const fn = run(`(function(module, exports){${fs.readFileSync(path.join(appDir, id + '.js'), 'utf8')}\n})`, id + '.js');
		fn(module, exports);
	},
	load(file) { includeFile(file); },
	openURL() {},
});

const Ejecta = {GlobalUtils, Canvas, Image, LocalStorage, HttpRequest, GamepadProvider};
for (const name of ['Audio', 'Video', 'WebSocket', 'Geolocation', 'KeyInput',
	'TouchInput', 'DeviceMotion', 'WindowEvents'])
	Ejecta[name] = nativeClass(name);
context.Ejecta = Ejecta;

function includeFile(file) {
	const full = path.join(appDir, file);
	if (!fs.existsSync(full)) throw new Error(`include: ${file} not found in ${appDir}`);
	run(fs.readFileSync(full, 'utf8'), file);
}

// --- Run ---------------------------------------------------------------------

process.on('unhandledRejection', (e) => errors.push('Unhandled rejection: ' + (e?.stack || e)));

function guard(label, fn) {
	try { fn(); }
	catch (e) { errors.push(`${label}: ${e?.stack?.split('\n').slice(0, 4).join('\n    ') || e}`); }
}

console.log(`Ejecta sim: ${path.relative(process.cwd(), appDir) || '.'} for ${seconds}s at ${SCREEN.width}x${SCREEN.height}`);
guard('Ejecta.js', () => run(fs.readFileSync(path.join(root, 'Source/Ejecta/Ejecta.js'), 'utf8'), 'Ejecta.js'));
// Watch the JS-side DOM emulation too.
context.HTMLElement.prototype = watchedProto('HTMLElement', context.HTMLElement.prototype, false);
for (const name of ['document', 'navigator'])
	context[name] = new Proxy(context[name], {
		get(t, p, r) { if (!(p in t)) noteMissing(name, p); return Reflect.get(t, p, r); }
	});
guard('index.js', () => includeFile('index.js'));

const frameCalls = [];
for (let frameEnd = 16; now < seconds * 1000; frameEnd += 1000 / 60) {
	const canvasCalls = () => Object.entries(calls).reduce((n, [k, v]) => k.startsWith('CanvasContext2D.') ? n + v : n, 0);
	const before = canvasCalls();
	// Press button 0 and push the stick right for a moment, once a second.
	if (simGamepads) {
		const t = now % 1000, pad = simGamepads[0];
		pad.buttons[0].pressed = t > 500 && t < 600;
		pad.buttons[0].value = +pad.buttons[0].pressed;
		pad.axes[0] = t > 500 ? 1 : 0;
		pad.timestamp = now;
	}
	for (;;) {
		let due = null;
		for (const [id, t] of timers) if (t.at <= frameEnd && (!due || t.at < due[1].at)) due = [id, t];
		if (!due) break;
		const [id, t] = due;
		now = Math.max(now, t.at);
		if (t.every) t.at += t.every; else timers.delete(id);
		guard('timer', t.cb);
		await new Promise((r) => setImmediate(r)); // let promises settle
	}
	await new Promise((r) => setImmediate(r));
	now = Math.max(now, frameEnd);
	frameCalls.push(canvasCalls() - before);
}

// --- Report ------------------------------------------------------------------

const top = (map) => [...map].sort((a, b) => b[1] - a[1]);
console.log('\nMissing in Ejecta (read but not bound):');
if (!missing.size) console.log('  none');
for (const [k, n] of top(missing)) console.log(`  ${k}  (${n}x)`);
if (notImplemented.size) {
	console.log('\nBound but not implemented by Ejecta:');
	for (const [k, n] of top(notImplemented)) console.log(`  ${k}  (${n}x)`);
}
console.log('\nErrors:');
if (!errors.length) console.log('  none');
for (const e of [...new Set(errors)].slice(0, 20)) console.log('  ' + e);
const lastSecond = frameCalls.slice(-60);
console.log(`\n2D context calls per frame over the last second: ${lastSecond.length ? Math.round(lastSecond.reduce((a, b) => a + b, 0) / lastSecond.length) : 0}`);
console.log('Most used native calls:');
for (const [k, n] of Object.entries(calls).sort((a, b) => b[1] - a[1]).slice(0, 12))
	console.log(`  ${k}  ${n}`);
process.exit(errors.length ? 1 : 0);
