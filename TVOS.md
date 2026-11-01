# Ejecta on Apple TV

This fork brings Ejecta's `Ejecta-TV` target up to date for current Xcode and tvOS. It adds the Web Audio API and `fetch()`, `just` recipes to build and install from a Mac, and what's needed to run [LittleJS](https://github.com/KilledByAPixel/LittleJS) games.

**Setup, local testing and working on the code: see the [developer guide](developer-guide.md).**

## Quick start

With Xcode, `just` and a `.env` file set up as the developer guide describes:

```sh
just littlejs-example   # put the LittleJS example in App/
just test               # tests that don't need Xcode
just check              # run App/ against Ejecta's API, list anything missing
just run-sim            # build and start it in the tvOS Simulator
just tv                 # build, install over Wi‑Fi and start it on the Apple TV
```

## What changed from upstream

- **Project**: tvOS and iOS 15 minimum, no Bitcode, automatic signing, the upstream author's team ID removed, iAd removed (gone from the SDK), and a shared `Ejecta-TV` scheme so `xcodebuild` and CI can build it.
- **Web Audio**: `AudioContext`, `AudioBuffer`, `AudioBufferSourceNode` with loop points, `GainNode`, `StereoPannerNode`, and effects: `BiquadFilterNode`, `DelayNode` (feedback loops work), `WaveShaperNode`, `DynamicsCompressorNode` and `ConvolverNode` (reverb). Also `AudioParam` ramps and `decodeAudioData()` for WAV, MP3, AAC, FLAC and Ogg Vorbis. All mixed natively on AVAudioEngine. See [How Web Audio works here](developer-guide.md#how-web-audio-works-here) for details.
- **fetch()**: loads files from the App folder or the network, with `json()`, `text()` and `arrayBuffer()`. A missing local file answers 404.
- **Canvas**: `ctx.ellipse()` and dashed lines (`setLineDash()`, `getLineDash()`, `lineDashOffset`) are implemented.
- **Typed arrays**: native code now reads a typed array view from its own start. Before, a `subarray()` passed to WebGL's `bufferData`, `readPixels` or similar was read from the start of its whole buffer.
- **Canvas style**: `canvas.style.width = "100%"` (and height, left, top) is now relative to the screen instead of being read as 100 px.
- **WebGL**: `getContext("webgl2")` returns `null` instead of a WebGL 1 context, so engines can tell it isn't there and fall back.
- **DOM emulation**: `appendChild`, `insertBefore` and `removeChild` return the node as in a browser, and children get `parentElement`. `document.hasFocus()` and `document.activeElement` exist.
- **Console**: `console.error(error)` prints the error and its stack instead of `{}`. Debug builds can be inspected with Safari's Web Inspector.
- **Gamepads**: on modern controllers, Options, Menu and the stick buttons now map to the standard buttons 8–11.

## Your own LittleJS game

```sh
just littlejs-app ~/path/to/my-game          # game.js is the entry file
just littlejs-app ~/path/to/my-game main.js  # or name it
just check
just tv
```

This copies your folder into `App/` and writes an `App/index.js` that loads LittleJS, then `extras/littlejs/littlejs-ejecta.js`, then your game. Your game needs to be a plain script that uses LittleJS's globals, like the LittleJS starter. ES module `import`s aren't supported.

`extras/littlejs/littlejs-ejecta.js` turns LittleJS's WebGL off, so it draws with Canvas2D. It also gives LittleJS Ejecta's screen canvas and fits a `setCanvasFixedSize` canvas to the screen. ZzFX sounds, sound files and LittleJS's audio effects (`AudioReverb`, `AudioDelay`, `AudioFilter`, `AudioDistortion`, `AudioCompressor`) work through Ejecta's Web Audio. In the example game, Play/Pause cycles through a reverb and an echo.

## Controls

LittleJS reads the Siri Remote and controllers as gamepad 0:

| Input | LittleJS |
|---|---|
| Swiping or resting a finger on the touch surface | `gamepadStick(0)`, and d‑pad buttons 12–15 |
| Click the touch surface | button 0 (`gamepadWasPressed(0)`) |
| Play/Pause | button 2 |
| Menu / Back | quits to the home screen |

To keep Menu from quitting (for a pause menu), set `navigator.getGamepads()[0].exitOnMenuPress = false`. Apple's review guidelines require Menu on the game's top‑level screen to return to the home screen.

## Known gaps

- **No WebGL 2.** LittleJS uses Canvas2D, which is fine for most 2D games. Thousands of sprites a frame will be slower than in a browser.
- **Audio graph limits**: up to 64 sounds at once, 64 effect nodes, and 16 connections out of each. Connecting a node to an `AudioParam` (modulation) does nothing, `AnalyserNode` reports silence, and a `WaveShaperNode`'s `oversample` is ignored. Reverb (`ConvolverNode`) output is 512 frames (about 11 ms) late.
- **Ogg Opus** files aren't decoded unless tvOS's own decoder handles them; Ogg Vorbis is.
- **Not yet run on a device.** CI builds the `Ejecta-TV` target with Xcode 16.4, and the C audio code and the JavaScript run under tests. Nothing has run in the Simulator or on an Apple TV yet.
