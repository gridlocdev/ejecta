# Ejecta on Apple TV

This fork brings Ejecta's `Ejecta-TV` target up to date for current Xcode and tvOS, adds `just` recipes to build and install from a Mac, and adds what's needed to run [LittleJS](https://github.com/KilledByAPixel/LittleJS) games.

## What changed from upstream

- **Project**: tvOS and iOS 15 minimum, no Bitcode, automatic signing, the upstream author's team ID removed, iAd removed (gone from the SDK), and a shared `Ejecta-TV` scheme so `xcodebuild` and CI can build it.
- **Canvas**: `ctx.ellipse()` is implemented. `setLineDash()`, `getLineDash()` and `lineDashOffset` exist so scripts that use them keep running, but lines are still drawn solid.
- **Canvas style**: `canvas.style.width = "100%"` (and height, left, top) is now relative to the screen instead of being read as 100 px.
- **WebGL**: `getContext("webgl2")` returns `null` instead of a WebGL 1 context, so engines can tell it isn't there and fall back.
- **DOM emulation**: `appendChild`, `insertBefore` and `removeChild` return the node as in a browser, and children get `parentElement`. `document.hasFocus()` and `document.activeElement` exist.
- **Gamepads**: on modern controllers, Options, Menu and the stick buttons now map to the standard buttons 8–11.

## One-time setup

1. Install Xcode 15 or newer and `just` (`brew install just`). `just check` also needs Node.
2. Pair the Apple TV: on the TV open **Settings → Remotes and Devices → Remote App and Devices**. On the Mac open Xcode → **Window → Devices and Simulators** and pick the Apple TV. Enter the code shown on the TV. Both need to be on the same network.
3. Create a `.env` file next to the `justfile`:

   ```sh
   EJECTA_TEAM_ID=ABCDE12345            # Xcode > Settings > Accounts > your team
   EJECTA_BUNDLE_ID=com.yourname.mygame
   EJECTA_TV="Living Room"              # the name `just devices` shows
   ```

   A free Apple ID works as a team, but apps it signs stop launching after 7 days. A paid developer account lasts a year.

## Everyday use

```sh
just littlejs-example   # put the LittleJS example in App/
just check              # run App/ in Node against Ejecta's API, list anything missing
just run-sim            # build and start it in the tvOS Simulator
just tv                 # build, install over Wi‑Fi and start it on the Apple TV
```

`just` with no arguments lists every recipe. `just launch` shows the game's `console.log` output in the terminal. Press Ctrl‑C to stop watching; the game keeps running.

## Your own LittleJS game

```sh
just littlejs-app ~/path/to/my-game          # game.js is the entry file
just littlejs-app ~/path/to/my-game main.js  # or name it
just check
just tv
```

This copies your folder into `App/` and writes an `App/index.js` that loads LittleJS, then `extras/littlejs/littlejs-ejecta.js`, then your game. Your game needs to be a plain script that uses LittleJS's globals, like the LittleJS starter. ES module `import`s aren't supported.

`extras/littlejs/littlejs-ejecta.js` turns LittleJS's WebGL off, so it draws with Canvas2D. It also gives LittleJS Ejecta's screen canvas and fits a `setCanvasFixedSize` canvas to the screen.

## Controls

LittleJS reads the Siri Remote and controllers as gamepad 0:

| Input | LittleJS |
|---|---|
| Swiping or resting a finger on the touch surface | `gamepadStick(0)`, and d‑pad buttons 12–15 |
| Click the touch surface | button 0 (`gamepadWasPressed(0)`) |
| Play/Pause | button 2 |
| Menu / Back | quits to the home screen |

To keep Menu from quitting (for a pause menu), set `navigator.getGamepads()[0].exitOnMenuPress = false`. Apple's review guidelines require Menu on the game's top‑level screen to return to the home screen.

## `just check`

`tools/ejecta-sim/sim.mjs` runs `App/` in Node with stand-ins for Ejecta's native classes. It reads the `EJ_BIND_*` macros in `Source/`, so it knows exactly what this copy of Ejecta binds. It reports every property your code reads that Ejecta doesn't have, plus any errors. A simulated remote presses the button and swipes once a second, so input code runs too. `just check 5 --lenient` keeps going past missing functions so you see all of them at once.

It catches missing APIs, not rendering bugs. Nothing is drawn, so check how the game looks in the Simulator or on the TV.

A few reads are harmless feature checks, like `navigator.audioSession`, which LittleJS only looks for.

## Known gaps

- **No sound in LittleJS games yet.** Ejecta has no Web Audio API, which LittleJS uses for ZzFX and sound files. The game runs silently. The next step would be a native `AudioContext` subset (buffers, gain, stereo panner, buffer sources) on Ejecta's OpenAL code.
- **No WebGL 2.** LittleJS uses Canvas2D, which is fine for most 2D games. Thousands of sprites a frame will be slower than in a browser.
- **Dashed lines** draw solid.
- **Untested on hardware yet.** These changes were written without a Mac at hand. Expect a round of compile fixes the first time you run `just build-sim`.
