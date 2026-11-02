# Developer guide

How to set up this fork, test changes locally and work on Ejecta itself. [TVOS.md](TVOS.md) covers what the fork adds and how to run a LittleJS game.

## What you need

| For | Needs |
|---|---|
| Tests and the API checker | Node 18+, a C compiler (`cc`), `just` |
| tvOS Simulator | A Mac with Xcode 15+ |
| A real Apple TV | The above, an Apple ID in Xcode, and the Apple TV on the same network as the Mac |

Install `just` with `brew install just` (macOS) or your package manager. `just` with no arguments lists every recipe.

## First-time setup

1. **Clone and check out the branch:**

   ```sh
   git clone -b tvos-modernize https://github.com/gridlocdev/ejecta
   cd ejecta
   ```

2. **Sign in to Xcode** with your Apple ID under **Xcode → Settings → Accounts**. Note your team ID; it's the 10-character code shown next to the team.

3. **Create `.env`** next to the `justfile` (it's git-ignored):

   ```sh
   EJECTA_TEAM_ID=ABCDE12345            # your team ID from step 2
   EJECTA_BUNDLE_ID=com.yourname.ejecta # any ID not used by someone else's app
   EJECTA_TV="Living Room"              # your Apple TV's name, from `just devices`
   # EJECTA_TV_SIMULATOR="Apple TV 4K (3rd generation)"  # from `just simulators`
   ```

   A free Apple ID works as a team, but apps it signs stop launching after 7 days and need reinstalling. A paid developer account signs for a year.

4. **Pair the Apple TV** (once):
   - On the TV: **Settings → Remotes and Devices → Remote App and Devices**. Leave that screen open.
   - On the Mac: **Xcode → Window → Devices and Simulators**. The Apple TV shows under Discovered; select it, click **Pair**, and type the code the TV shows.
   - Check with `just devices`. The TV should be listed; its name is what goes in `EJECTA_TV`.

5. **Put a game in `App/`.** Ejecta runs whatever is in `App/index.js`. `App/` is git-ignored, so each machine has its own:

   ```sh
   just littlejs-example     # the LittleJS example (downloads LittleJS once)
   just setup                # or Ejecta's own canvas sample, if App/ is empty
   ```

## Testing locally

There are three levels. Use the cheapest one that covers your change.

### 1. Without a Mac: `just test` and `just check`

```sh
just test     # all of the below that doesn't need a game in App/
just check    # run the game in App/ against Ejecta's API
```

- `just test-mixer` compiles the native audio code in `Source/Ejecta/EJAudio/` with AddressSanitizer and runs three test programs in `tools/audio-mixer-test/`:
  - `test.c` (the mixer): mixing, resampling, panning matrices, loop points, effect buses and routing, delay feedback, and a two-thread stress test.
  - `effects_test.c`: each effect's response, and the convolver against direct convolution.
  - `ogg_test.c`: decoding the Ogg files in `data/`.
- `just test-canvas` tests how lines are cut into dashes (`EJPathDash.h`).
- `just test-js` runs two test apps in the API simulator. Lines starting with `FAIL` make it exit with an error.
  - `tools/ejecta-sim/tests/webaudio` checks the Web Audio API and `fetch()` in `Ejecta.js`: gain, panning, ramps, loop points, `ended` events, every effect node, an echo with feedback, `decodeAudioData` (WAV and Ogg), suspend and resume, and loading files.
  - `tools/ejecta-sim/tests/webgl2` checks that `getContext('webgl2')` gives the WebGL 2 binding, with its WebGL 1 calls, its own calls and constants. Nothing is drawn there; `just test-sim` draws for real.
- `just check [seconds] [--lenient]` runs `App/` in the API simulator (`tools/ejecta-sim/sim.mjs`). It lists every property the game reads that Ejecta doesn't bind, plus errors, sound levels and how many canvas calls a frame makes. A fake Siri Remote clicks and swipes once a second. `--lenient` keeps going past missing functions, so you see all of them in one run.

The simulator reads the `EJ_BIND_*` macros in `Source/`, so it always matches the native code. Audio runs through the real C code (mixer, effects and Ogg decoder), built as WebAssembly in `tools/ejecta-sim/wasm/mixer.wasm`. That file is checked in, so you only rebuild it after changing the C audio code: `just build-wasm`, which needs LLVM's clang and `wasm-ld` (on macOS, `brew install llvm lld` and run it with `CC=$(brew --prefix llvm)/bin/clang`). The simulator warns, and CI fails, if `mixer.wasm` is older than the C code. The simulator doesn't draw anything, so it can't catch rendering bugs. A few reported reads are harmless feature checks, like `navigator.audioSession`.

These run on any machine, and CI runs them on every push.

### 2. tvOS Simulator: `just test-sim` and `just run-sim`

```sh
just test-sim       # the device tests, in a fresh simulator; replaces App/
```

`just test-sim` builds the app with `tools/device-tests/App` (plus LittleJS and its shim) and runs it in a new Apple TV simulator with `tools/device-tests/run_sim.py`. The tests draw with the real canvas and WebGL code and read the pixels back: `canvas2d-test.js` covers what the 2D renderer does (paths and fill rules, clipping, gradients, patterns, text, images, compositing, image data, antialiasing, the screen canvas, 2D canvases uploaded into WebGL). They also check audio with effects, Ogg decoding, `fetch()`, and LittleJS rendering on WebGL 2 to the screen. It prints the app's console and exits with an error on any `FAIL` line, a crash, or a timeout; on a hang it prints the app's thread stacks, on a crash its crash report. CI runs it on every push.

The simulator runs Canvas2D's Metal on the Mac's GPU, but WebGL in a software renderer that can't share surfaces with Metal. So an offscreen WebGL canvas drawn into a 2D canvas goes through a pixel copy there (the log says `Could not share a … texture`); on an Apple TV it doesn't.

Add a test there when you change native code; it's the only automated check that runs Apple's frameworks.

To watch a game instead:

```sh
just run-sim        # build, install and start; console output appears here
just simulators     # list simulators, to pick EJECTA_TV_SIMULATOR
```

No signing or Apple ID needed. To use the remote, open **Window → Show Apple TV Remote** in the Simulator app, or use the arrow keys, Return (select) and Escape (Menu). A game controller connected to the Mac also works. Press Ctrl‑C to stop following the output.

After changing files in `App/`, run `just run-sim` again to rebuild and restart.

### 3. Apple TV over Wi‑Fi: `just tv`

```sh
just tv             # build, sign, install and start, then follow its output
just install        # reinstall the last build
just launch         # start it again and follow its output
```

It builds for the paired TV named `EJECTA_TV`, so the first build can register that TV with your team and make a provisioning profile for your bundle ID (`-allowProvisioningUpdates -allowProvisioningDeviceRegistration`). macOS then asks whether `codesign` may use your signing key: enter your Mac login password and click **Always Allow**. If the build still fails, open the project once with `just xcode`, select the **Ejecta-TV** target → **Signing & Capabilities**, and pick your team. Xcode shows what's wrong there.

### Debugging JavaScript with Safari

Debug builds make the game's JavaScript context inspectable (tvOS 16.4 and later). With the game running in the Simulator or on the TV:

1. In Safari on the Mac, turn on **Settings → Advanced → Show features for web developers**.
2. Open the **Develop** menu, find the Simulator or the Apple TV, and pick the Ejecta context.

Web Inspector gives you the console with live objects, breakpoints, and the profiler. `console.log` output also goes to the device log, which `just launch` and Xcode's debug area show.

### Debugging native code with Xcode

`just xcode` opens the project. Choose the **Ejecta-TV** scheme and your Apple TV or a simulator as the destination, then Run. Set the team and bundle ID under the target's **Signing & Capabilities** first; the `.env` values only apply to `just`.

## CI

`.github/workflows/tvos.yml` runs on every push:

- **littlejs-check** (Linux): `just test`, then `just littlejs-example` and `just check`.
- **build** (macOS): `just build-sim`, which compiles the `Ejecta-TV` target for the tvOS Simulator without signing, then `just test-sim`, which runs the device tests in it.

GitHub turns Actions off for new forks. If nothing runs, enable them under the repository's **Actions** tab.

## Repository layout

| Path | What it is |
|---|---|
| `Source/Ejecta/` | Ejecta's native code; `Ejecta.js` is the JavaScript that runs before the game |
| `Source/Ejecta/EJAudio/EJAudioMixerCore.c` | The sample mixer behind Web Audio: voices, effect buses, routing. Plain C |
| `Source/Ejecta/EJAudio/EJAudioEffects.c` | Filter, delay, wave shaper, compressor and convolver DSP. Plain C |
| `Source/Ejecta/EJAudio/EJAudioDecodeOgg.c` | Ogg Vorbis decoding with `Source/lib/stb/stb_vorbis.c` |
| `Source/Ejecta/EJSharedMetalContext.m` | Canvas2D's Metal device, shaders, pipeline states and per-frame command buffer |
| `Source/Ejecta/EJCanvas/2D/EJCanvasContext2D.m` | Canvas2D drawing: vertex batching, render passes, clipping and image data |
| `Source/Ejecta/EJCanvas/EJTexture.m` | Images and canvas pixels, as Metal or OpenGL textures, and the surfaces they share |
| `Source/Ejecta/EJCanvas/2D/EJPathDash.h` | Cuts paths into dashes for `setLineDash()` |
| `Source/Ejecta/EJAudio/EJBindingAudioMixer.m` | `Ejecta.AudioMixer`: runs the mixer on AVAudioEngine, decodes audio files |
| `extras/littlejs/` | The LittleJS adapter (`littlejs-ejecta.js`) and example game |
| `tools/ejecta-sim/` | The API simulator and its tests |
| `tools/audio-mixer-test/`, `tools/canvas-test/` | C and C++ tests |
| `tools/ejecta-sim/wasm/` | Builds the audio C code as WebAssembly for the simulator |
| `tools/device-tests/` | Tests that run inside the app in a tvOS Simulator, and the script that runs them |
| `App/` | The game that gets built in (git-ignored) |

## Working on Ejecta

### Adding or changing a native binding

A class named `EJBindingFoo` is available to JavaScript as `new Ejecta.Foo()`. Members are declared with macros in its `.m` file:

```objc
EJ_BIND_FUNCTION(doThing, ctx, argc, argv) { ... return NULL; }
EJ_BIND_GET(size, ctx) { return JSValueMakeNumber(ctx, size); }
EJ_BIND_SET(size, ctx, value) { size = JSValueToNumberFast(ctx, value); }
EJ_BIND_EVENT(load);   // onload, and addEventListener('load') on evented classes
```

A new `.m` or `.c` file has to be added to **both** targets (`Ejecta` and `Ejecta-TV`). Do it in Xcode, or by hand in `project.pbxproj`: a file reference, a build file per target, the group, and each target's Sources phase. The audio mixer commit is an example.

The simulator picks up new bindings automatically. If JavaScript depends on what a binding returns, give it a stand-in in `sim.mjs` (see `AudioMixer` and `HttpRequest` there).

### Changing Ejecta.js

`Source/Ejecta/Ejecta.js` sets up `window`, `document`, `console`, timers, input events, `fetch()` and Web Audio before the game's `index.js` runs. It is plain JavaScript, so `just test-js` and `just check` exercise changes to it without a Mac.

### How Web Audio works here

`Ejecta.js` implements the Web Audio objects in JavaScript and compiles the node graph for the native mixer whenever it changes, at most once a frame:

- **Gains and stereo panners are folded into routes.** Each route goes from a source or an effect to the output or to another effect, through a 2×2 matrix (left and right in, left and right out).
- **Each effect node is a bus in the mixer**: `BiquadFilterNode`, `DelayNode`, `WaveShaperNode`, `DynamicsCompressorNode` or `ConvolverNode`. Buses run in order in 128-frame blocks. A route back to a bus that already ran this block (a feedback loop through a delay) arrives one block later, as in browsers.
- **Mono stays mono** until a panner or a stereo source makes it stereo, so panning matches browsers.
- **The mixer** (`EJAudioMixerCore.c`) resamples sources with linear interpolation and sums everything into one AVAudioSourceNode. It never blocks the audio thread: if the JavaScript side is changing something at that moment, it outputs one block of silence.
- **Reverb** is uniformly partitioned FFT convolution in 512-frame blocks, so its output is 512 frames late. A reverb that has gone quiet stops using CPU.

Up to 64 sounds play at once. A `start()` beyond that fires `ended` straight away. Decoding goes through AVAudioFile (WAV, MP3, AAC/M4A, AIFF, CAF, FLAC) and stb_vorbis (Ogg Vorbis). Audio stops while the app is in the background and picks up when it returns.

### How Canvas2D draws (Metal)

Canvas2D draws with Metal; WebGL still uses OpenGL ES, which Apple has deprecated.

- **Batching.** Every 2D call pushes vertices (position, texture coordinate, color) into a buffer. The buffer is drawn in one call when something changes that a draw call can't mix: the texture, the shader, the blend mode, the stencil settings, or another canvas starting to draw. Thousands of sprites from one image are one draw call.
- **Render passes.** Each canvas draws into its own Metal texture (BGRA, top row first). A render pass into it stays open until another canvas draws, pixels are read back, or the frame ends. Clearing is the next pass's load action. All canvases share one command buffer per frame, so a canvas drawn into another shows everything drawn into it before.
- **The screen canvas** copies its texture into a `CAMetalLayer` drawable to present. The pixels stay between frames, as the 2D canvas spec wants.
- **Clipping and paths** work as they did with OpenGL. `clip()` writes depth values where the path is, and drawing then passes only where the depth matches. Concave paths are filled in two steps: their triangles mark the stencil buffer (non-zero counts front faces up and back faces down, even-odd inverts), then a rectangle fills where the stencil is set. Transparent strokes use the stencil so that overlapping segments blend once.
- **Shaders** are Metal source in `EJSharedMetalContext.m`, compiled when the app starts. That way building doesn't need Xcode's separately downloaded Metal toolchain.
- **Antialiasing** (`getContext('2d', {antialias: true})`) draws into a 2- or 4-sample texture, whichever the GPU supports. A small shader averages the samples into the canvas texture whenever that is read or drawn. This works on every Apple TV, unlike the store action that does it on newer GPUs.

Textures cross between the two APIs as follows:

| Drawn by | Used by | How |
|---|---|---|
| Image, ImageData, 2D canvas | Canvas2D | Metal texture |
| Image | WebGL | OpenGL copy made from its pixels (from the file for local images), once |
| 2D canvas | WebGL `texImage2D` | Pixels read back from Metal; a snapshot, as in browsers |
| Offscreen WebGL canvas | Canvas2D `drawImage` | An IOSurface that OpenGL renders into and Metal reads, no copy. OpenGL work is flushed before Metal reads it, and WebGL waits for Metal's reads before drawing into it again |
| Screen WebGL canvas | Canvas2D `drawImage` | Pixels read back with `glReadPixels` |

### How WebGL 2 works here

`getContext('webgl2')` gives a native WebGL 2 context: `EJBindingCanvasContextWebGL2` on an OpenGL ES 3 context.

- **Every OpenGL context is ES 3**: WebGL 1 canvases and the shared resource context too, so textures move between all of them. WebGL 1 doesn't offer the extensions that are core in ES 3 (vertex arrays, instancing, float textures) through OpenGL's extension calls; they call the core functions.
- **Shaders**: GLSL ES 3.00 goes to OpenGL as written. GLSL ES 1.00 shaders work in both contexts.
- **The binding** subclasses the WebGL 1 binding, so it has every WebGL 1 call. It overrides the calls whose WebGL 2 form takes more arguments (`texImage2D`, `bufferData`, `readPixels`, `getParameter`...) and adds the rest.
- **The canvas's own framebuffer** is a framebuffer object in OpenGL. When it is bound, `drawBuffers`, `readBuffer`, `invalidateFramebuffer` and `getFramebufferAttachmentParameter` map `BACK`, `COLOR`, `DEPTH` and `STENCIL` to its attachments.
- **Antialiased canvases** draw into a multisampled framebuffer. It is resolved into the canvas's framebuffer before it's shown, read with `readPixels`, or drawn into a 2D canvas.
- **Texture uploads** from images, canvases and typed arrays follow `UNPACK_FLIP_Y_WEBGL` and `UNPACK_PREMULTIPLY_ALPHA_WEBGL`. They also follow the unpack state: row length, skipped rows, pixels and images, and image height. They can read from a `PIXEL_UNPACK_BUFFER`.
- **Not done**: compressed textures, and float render targets beyond `EXT_color_buffer_half_float`. Query results are ready as soon as the GPU has them; browsers hold them until the next frame. `clientWaitSync` never blocks: `MAX_CLIENT_WAIT_TIMEOUT_WEBGL` is 0.

`tools/device-tests` draws with every part of this and reads the pixels back.

## Troubleshooting

- **`just devices` doesn't list the TV**: wake it, check both are on the same network, and re-pair from Xcode's Devices window.
- **"Your team has no devices"**: the TV isn't registered with the team yet. `just tv` registers it when the TV is paired and awake; check `just devices` lists it as connected.
- **`errSecInternalComponent` when signing**: the keychain prompt for `codesign` wasn't answered. Run `just tv` again and click **Always Allow**.
- **Signing certificate shows as not valid** (`security find-identity -v -p codesigning` finds 0): the keychain lacks Apple's WWDR G3 intermediate certificate. Download *Worldwide Developer Relations - G3* from apple.com/certificateauthority and add it to the login keychain.
- **"No profiles for … were found"**: the bundle ID is taken or the team is wrong. Change `EJECTA_BUNDLE_ID`, or open the project and fix signing as above.
- **The app opens and closes after 7 days**: the free Apple ID profile expired. Run `just tv` again.
- **Build error about `App`**: `App/` doesn't exist. Run `just setup` or `just littlejs-example`.
- **No sound**: check the TV's volume and output. `just launch` shows `AudioMixer:` messages if the audio engine couldn't start.
