# Ejecta on Apple TV

This fork brings Ejecta's `Ejecta-TV` target up to date for current Xcode and tvOS. It adds WebGL 2, the Web Audio API and `fetch()`, `just` recipes to build and install from a Mac, and what's needed to run [LittleJS](https://github.com/KilledByAPixel/LittleJS) games.

**Setup, local testing and working on the code: see the [developer guide](developer-guide.md).**

## Quick start

With Xcode, `just` and a `.env` file set up as the developer guide describes:

```sh
just littlejs-example   # put the LittleJS example in App/
just test               # tests that don't need Xcode
just check              # run App/ against Ejecta's API, list anything missing
just run-sim            # build and start it in the tvOS Simulator
just test-sim           # run the device tests in a fresh tvOS Simulator
just tv                 # build, install over Wi‑Fi and start it on the Apple TV
```

## What changed from upstream

- **Project**: tvOS and iOS 15 minimum, no Bitcode, automatic signing, the upstream author's team ID removed, iAd removed (gone from the SDK), and a shared `Ejecta-TV` scheme so `xcodebuild` and CI can build it.
- **Web Audio**: `AudioContext`, `AudioBuffer`, `AudioBufferSourceNode` with loop points, `GainNode`, `StereoPannerNode`, and effects: `BiquadFilterNode`, `DelayNode` (feedback loops work), `WaveShaperNode`, `DynamicsCompressorNode` and `ConvolverNode` (reverb). Also `AudioParam` ramps and `decodeAudioData()` for WAV, MP3, AAC, FLAC and Ogg Vorbis. All mixed natively on AVAudioEngine. See [How Web Audio works here](developer-guide.md#how-web-audio-works-here) for details.
- **fetch()**: loads files from the App folder or the network, with `json()`, `text()` and `arrayBuffer()`. A missing local file answers 404.
- **Canvas2D draws with Metal** instead of the deprecated OpenGL ES. It keeps the old renderer's batching, so many sprites from one image are still one draw call. An offscreen WebGL canvas drawn into a 2D canvas (what LittleJS does each frame) is shared with Metal rather than copied. Drawing the screen canvas into another canvas now works; with OpenGL it came out transparent. See [How Canvas2D draws](developer-guide.md#how-canvas2d-draws-metal).
- **Canvas**: `ctx.ellipse()` and dashed lines (`setLineDash()`, `getLineDash()`, `lineDashOffset`) are implemented.
- **Typed arrays**: native code now reads a typed array view from its own start. Before, a `subarray()` passed to WebGL's `bufferData`, `readPixels` or similar was read from the start of its whole buffer.
- **Canvas style**: `canvas.style.width = "100%"` (and height, left, top) is now relative to the screen instead of being read as 100 px.
- **WebGL 2**: `getContext("webgl2")` gives a native WebGL 2 context on OpenGL ES 3. GLSL ES 3.00 shaders compile as written. It has 3D and array textures, sized, integer and float formats, samplers, multiple render targets, multisampled framebuffers and blits, uniform buffers, queries, fences and transform feedback. See [How WebGL 2 works here](developer-guide.md#how-webgl-2-works-here).
- **WebGL fixes**:
  - Offscreen WebGL canvases drew to no framebuffer until their size was set a second time, so nothing they drew showed.
  - `readPixels` on an antialiased canvas failed.
  - `getParameter(VIEWPORT)`, `SCISSOR_BOX` and the other array results were wrong or four times too long.
  - `getUniform` read integer vectors as floats and missed samplers and array elements.
  - `framebufferTexture2D` changed the active texture binding.
- **DOM emulation**: `appendChild`, `insertBefore` and `removeChild` return the node as in a browser, and children get `parentElement`. `document.hasFocus()` and `document.activeElement` exist.
- **Console**: `console.error(error)` prints the error and its stack instead of `{}`. Debug builds can be inspected with Safari's Web Inspector.
- **Gamepads**: on modern controllers, Options, Menu and the stick buttons now map to the standard buttons 8–11.
- **UIScene lifecycle**: the app starts through a `SceneDelegate`. tvOS 27 stops apps at launch that don't adopt UIScene.
- **Colors**: `#rgba` and `#rrggbbaa` hex colors are parsed (LittleJS's `Color.toString()` makes these). Before, they came out black.
- **LittleJS shim**: `extras/littlejs/littlejs-ejecta.js` sets the screen canvas's style size, so a 2x screen shows the whole game, not its top-left quarter.

## Your own LittleJS game

```sh
just littlejs-app ~/path/to/my-game          # game.js is the entry file
just littlejs-app ~/path/to/my-game main.js  # or name it
just check
just tv
```

This copies your folder into `App/` and writes an `App/index.js` that loads LittleJS, then `extras/littlejs/littlejs-ejecta.js`, then your game. Your game needs to be a plain script that uses LittleJS's globals, like the LittleJS starter. ES module `import`s aren't supported.

LittleJS renders with WebGL 2. In a browser it layers a WebGL canvas and a 2D canvas (for text) on the page; Ejecta shows one screen canvas, so `extras/littlejs/littlejs-ejecta.js` draws both into it after each frame, centered and fitted the way the page would show them (including `setCanvasFixedSize`). ZzFX sounds, sound files and LittleJS's audio effects (`AudioReverb`, `AudioDelay`, `AudioFilter`, `AudioDistortion`, `AudioCompressor`) work through Ejecta's Web Audio. In the example game, Play/Pause cycles through a reverb and an echo.

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

- **WebGL 2 gaps**: there are no compressed textures, and the only float render target extension is `EXT_color_buffer_half_float`. Query results don't wait for the next frame as browsers make them, and `clientWaitSync` never blocks.
- **Audio graph limits**: up to 64 sounds at once, 64 effect nodes, and 16 connections out of each. Connecting a node to an `AudioParam` (modulation) does nothing, `AnalyserNode` reports silence, and a `WaveShaperNode`'s `oversample` is ignored. Reverb (`ConvolverNode`) output is 512 frames (about 11 ms) late.
- **Ogg Opus** files aren't decoded unless tvOS's own decoder handles them; Ogg Vorbis is.
- **WebGL still uses OpenGL ES.** Apple deprecated it but still ships it on tvOS. Moving WebGL to Metal would mean translating OpenGL to Metal underneath it (as ANGLE does), which isn't done.
- **Tested on one Apple TV.** CI builds the app with Xcode 16.4 and runs `tools/device-tests` in a tvOS 18.5 Simulator, and they pass in a tvOS 27.2 Simulator too. On an Apple TV 4K (3rd generation, A15) with tvOS 27.2, a LittleJS game draws with WebGL 2 at 60 fps in 4K, and its WebGL canvas reaches the screen through a texture shared with Metal, not a pixel copy. The device tests haven't run on hardware, and older Apple TVs are untested. If sharing fails on one, the log says `Could not share a … texture` and drawing falls back to a slower pixel copy.
