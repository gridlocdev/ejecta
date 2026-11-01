#!/bin/sh
# Builds the native audio code (mixer, effects, Ogg Vorbis decoder) as
# WebAssembly for the API simulator, so it runs the same code as the device.
# Needs LLVM clang with the wasm32 target and wasm-ld (on macOS: brew install
# llvm lld, then CC=/opt/homebrew/opt/llvm/bin/clang). The result,
# mixer.wasm, is checked in, so only changes to the C code need a rebuild.
set -e
cd "$(dirname "$0")"
SRC=../../../Source/Ejecta/EJAudio
${CC:-clang} --target=wasm32 -mbulk-memory -O2 -nostdlib -ffreestanding \
	-Iinclude -I"$SRC" \
	-Wl,--no-entry -Wl,--allow-undefined -Wl,--strip-all \
	-Wl,--export=malloc -Wl,--export=free -Wl,--export=__heap_base \
	-o mixer.wasm \
	shim.c exports.c "$SRC/EJAudioMixerCore.c" "$SRC/EJAudioEffects.c" "$SRC/EJAudioDecodeOgg.c"
node sources.mjs > mixer.wasm.sources
echo "built $(pwd)/mixer.wasm ($(wc -c < mixer.wasm) bytes)"
