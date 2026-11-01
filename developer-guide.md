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

- `just test-mixer` compiles the native audio mixer (`Source/Ejecta/EJAudio/EJAudioMixerCore.c`) with AddressSanitizer and runs `tools/audio-mixer-test/test.c`: mixing, resampling, panning matrices, loops, stops, and a two-thread stress test.
- `just test-js` runs `tools/ejecta-sim/tests/webaudio` in the API simulator. It checks the Web Audio API and `fetch()` in `Ejecta.js`: gain, panning, ramps, `ended` events, `decodeAudioData`, suspend and resume, and loading files. Lines starting with `FAIL` make it exit with an error.
- `just check [seconds] [--lenient]` runs `App/` in the API simulator (`tools/ejecta-sim/sim.mjs`). It lists every property the game reads that Ejecta doesn't bind, plus errors, sound levels and how many canvas calls a frame makes. A fake Siri Remote clicks and swipes once a second. `--lenient` keeps going past missing functions, so you see all of them in one run.

The simulator reads the `EJ_BIND_*` macros in `Source/`, so it always matches the native code. It mixes audio with a JavaScript copy of the C mixer. It doesn't draw anything, so it can't catch rendering bugs. A few reported reads are harmless feature checks, like `navigator.audioSession`.

These are the same checks CI runs on every push.

### 2. tvOS Simulator: `just run-sim`

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

The first build asks Xcode to create a provisioning profile for your bundle ID (`-allowProvisioningUpdates`). If it fails, open the project once with `just xcode`, select the **Ejecta-TV** target → **Signing & Capabilities**, and pick your team. Xcode shows what's wrong there.

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
- **build** (macOS): `just build-sim`, which compiles the `Ejecta-TV` target for the tvOS Simulator without signing.

GitHub turns Actions off for new forks. If nothing runs, enable them under the repository's **Actions** tab.

## Repository layout

| Path | What it is |
|---|---|
| `Source/Ejecta/` | Ejecta's native code; `Ejecta.js` is the JavaScript that runs before the game |
| `Source/Ejecta/EJAudio/EJAudioMixerCore.c` | The sample mixer behind Web Audio, plain C |
| `Source/Ejecta/EJAudio/EJBindingAudioMixer.m` | `Ejecta.AudioMixer`: runs the mixer on AVAudioEngine, decodes audio files |
| `extras/littlejs/` | The LittleJS adapter (`littlejs-ejecta.js`) and example game |
| `tools/ejecta-sim/` | The API simulator and its tests |
| `tools/audio-mixer-test/` | C tests for the mixer |
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

`Ejecta.js` implements the Web Audio objects in JavaScript. When a source plays, the gains and stereo panners on every path from it to the destination are folded into one 2×2 matrix and a playback rate. These go to the native mixer, which resamples with linear interpolation and mixes all voices into one AVAudioSourceNode. Changes to gains, pans and ramps are pushed once per frame. Filter, delay, compressor, convolver and wave shaper nodes can be built into a chain, but they pass sound through unchanged.

Up to 64 sounds play at once. A `start()` beyond that fires `ended` straight away. Decoding goes through AVAudioFile, so WAV, MP3, AAC/M4A, AIFF, CAF and FLAC work. Ogg Vorbis and Opus probably don't, so convert `.ogg` files to `.m4a` or `.mp3`; `decodeAudioData` rejects what it can't read. Audio stops while the app is in the background and picks up when it returns.

## Troubleshooting

- **`just devices` doesn't list the TV**: wake it, check both are on the same network, and re-pair from Xcode's Devices window.
- **"No profiles for … were found"**: the bundle ID is taken or the team is wrong. Change `EJECTA_BUNDLE_ID`, or open the project and fix signing as above.
- **The app opens and closes after 7 days**: the free Apple ID profile expired. Run `just tv` again.
- **Build error about `App`**: `App/` doesn't exist. Run `just setup` or `just littlejs-example`.
- **No sound**: check the TV's volume and output. `just launch` shows `AudioMixer:` messages if the audio engine couldn't start.
