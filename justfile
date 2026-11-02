# Build, install and test Ejecta on an Apple TV from a Mac.
# Needs Xcode 15 or newer and `just` (brew install just).
#
# Settings come from the environment or a .env file next to this one:
#   EJECTA_TEAM_ID    your Apple Developer team ID (Xcode > Settings > Accounts)
#   EJECTA_BUNDLE_ID  a bundle ID of your own, e.g. com.yourname.mygame
#   EJECTA_TV         your Apple TV's name, as `just devices` lists it

set dotenv-load

team_id   := env("EJECTA_TEAM_ID", "")
bundle_id := env("EJECTA_BUNDLE_ID", "com.yourcompany.ejecta")
tv        := env("EJECTA_TV", "")
sim_name  := env("EJECTA_TV_SIMULATOR", "Apple TV 4K (3rd generation)")
littlejs_version := env("LITTLEJS_VERSION", "1.28.0")

project := "Ejecta.xcodeproj"
scheme  := "Ejecta-TV"
derived := "build"
device_app := derived / "Build/Products/Debug-appletvos/Ejecta-TV.app"
sim_app    := derived / "Build/Products/Debug-appletvsimulator/Ejecta-TV.app"

# List the recipes
default:
    @just --list --unsorted

# --- The game in App/ -------------------------------------------------------

# Put Ejecta's own sample (index.js) in App/ if App/ is empty
setup:
    mkdir -p App
    [ -e App/index.js ] || cp index.js App/index.js

# Download the LittleJS release build used by the recipes below
littlejs-fetch:
    mkdir -p extras/littlejs/vendor
    curl -fL -o extras/littlejs/vendor/littlejs.js \
        "https://raw.githubusercontent.com/KilledByAPixel/LittleJS/v{{littlejs_version}}/dist/littlejs.release.js"

# Replace App/ with the LittleJS example game
littlejs-example: _littlejs
    rm -rf App && mkdir App
    cp extras/littlejs/example/* App/
    cp extras/littlejs/vendor/littlejs.js extras/littlejs/littlejs-ejecta.js App/

# Replace App/ with your LittleJS game folder (its main file is game.js unless you say otherwise)
littlejs-app dir main="game.js": _littlejs
    rm -rf App && mkdir App
    cp -R "{{dir}}"/. App/
    rm -f App/index.html
    printf "ejecta.include('littlejs.js');\nejecta.include('littlejs-ejecta.js');\nejecta.include('%s');\n" "{{main}}" > App/index.js
    cp extras/littlejs/vendor/littlejs.js extras/littlejs/littlejs-ejecta.js App/

_littlejs:
    [ -e extras/littlejs/vendor/littlejs.js ] || just littlejs-fetch

# Run App/ in Node against Ejecta's API and list browser APIs it uses that Ejecta lacks
check seconds="5" *flags:
    node tools/ejecta-sim/sim.mjs App {{seconds}} {{flags}}

# --- Tests that run on any machine ------------------------------------------

# Run every test that doesn't need Xcode (C and C++ compilers and Node)
test: test-mixer test-canvas test-js

# Build and run the audio C tests (mixer, effects, Ogg decoder) with AddressSanitizer
test-mixer:
    mkdir -p {{derived}}
    cc -std=c11 -Wall -Wextra -O1 -g -fsanitize=address,undefined -ISource/Ejecta/EJAudio \
        Source/Ejecta/EJAudio/EJAudioMixerCore.c Source/Ejecta/EJAudio/EJAudioEffects.c \
        tools/audio-mixer-test/test.c -lm -lpthread -o {{derived}}/mixer-test
    cc -std=c11 -Wall -Wextra -O1 -g -fsanitize=address,undefined -ISource/Ejecta/EJAudio \
        Source/Ejecta/EJAudio/EJAudioEffects.c tools/audio-mixer-test/effects_test.c -lm -o {{derived}}/effects-test
    cc -std=c11 -O1 -g -fsanitize=address,undefined -ISource/Ejecta/EJAudio \
        Source/Ejecta/EJAudio/EJAudioDecodeOgg.c tools/audio-mixer-test/ogg_test.c -lm -o {{derived}}/ogg-test
    {{derived}}/mixer-test
    {{derived}}/effects-test
    {{derived}}/ogg-test tools/audio-mixer-test/data

# Build and run the canvas C++ tests (dashed lines)
test-canvas:
    mkdir -p {{derived}}
    c++ -std=c++11 -Wall -Wextra -O1 -g -fsanitize=address,undefined -ISource/Ejecta/EJCanvas/2D \
        tools/canvas-test/dash_test.cpp -o {{derived}}/dash-test
    {{derived}}/dash-test

# Check Ejecta.js's Web Audio, fetch() and WebGL 2 layer in the API simulator
test-js:
    node tools/ejecta-sim/sim.mjs tools/ejecta-sim/tests/webaudio 8
    node tools/ejecta-sim/sim.mjs tools/ejecta-sim/tests/webgl2 1

# Rebuild the simulator's WebAssembly copy of the audio C code (needs LLVM clang with wasm32 and wasm-ld)
build-wasm:
    tools/ejecta-sim/wasm/build.sh

# --- Simulator ----------------------------------------------------------------

# Build for the tvOS Simulator (no signing needed)
build-sim: setup
    xcodebuild -project {{project}} -scheme {{scheme}} -configuration Debug \
        -destination 'generic/platform=tvOS Simulator' -derivedDataPath {{derived}} \
        CODE_SIGNING_ALLOWED=NO PRODUCT_BUNDLE_IDENTIFIER={{bundle_id}} build -quiet

# Build, then install and start it in the tvOS Simulator
run-sim: build-sim
    xcrun simctl boot "{{sim_name}}" 2>/dev/null || true
    open -a Simulator
    xcrun simctl install "{{sim_name}}" {{sim_app}}
    xcrun simctl launch --console-pty "{{sim_name}}" {{bundle_id}}

# Run tools/device-tests in a fresh tvOS Simulator: real canvas, WebGL, audio (replaces App/)
test-sim:
    rm -rf App && cp -R tools/device-tests/App App
    just build-sim
    python3 tools/device-tests/run_sim.py {{sim_app}} {{bundle_id}}

# List the tvOS simulators Xcode has, to pick EJECTA_TV_SIMULATOR
simulators:
    xcrun simctl list devices tvOS

# --- Apple TV -----------------------------------------------------------------

# List paired devices (pair the Apple TV in Xcode > Window > Devices and Simulators first)
devices:
    xcrun devicectl list devices

# Build and sign for a real Apple TV
build-tv: setup _need-team
    xcodebuild -project {{project}} -scheme {{scheme}} -configuration Debug \
        -destination 'generic/platform=tvOS' -derivedDataPath {{derived}} \
        -allowProvisioningUpdates DEVELOPMENT_TEAM={{team_id}} \
        PRODUCT_BUNDLE_IDENTIFIER={{bundle_id}} build -quiet

# Install the last build on the Apple TV over the network
install: _need-tv
    xcrun devicectl device install app --device "{{tv}}" {{device_app}}

# Start the game on the Apple TV, showing its console.log output here
launch: _need-tv
    xcrun devicectl device process launch --console --terminate-existing --device "{{tv}}" {{bundle_id}}

# Build, install and start it on the Apple TV
tv: build-tv install launch

# Open the project in Xcode
xcode:
    open {{project}}

# Remove build output
clean:
    rm -rf {{derived}}

_need-team:
    @[ -n "{{team_id}}" ] || { echo "Set EJECTA_TEAM_ID (and EJECTA_BUNDLE_ID) in .env first"; exit 1; }

_need-tv:
    @[ -n "{{tv}}" ] || { echo "Set EJECTA_TV in .env to your Apple TV's name from 'just devices'"; exit 1; }
