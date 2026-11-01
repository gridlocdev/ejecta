// Hash of the C sources mixer.wasm is built from, so a stale mixer.wasm can
// be noticed. `node sources.mjs` prints it; `--check` exits 1 if mixer.wasm
// was built from other sources than the current ones.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const audio = path.join(here, '../../../Source/Ejecta/EJAudio');
const files = [
	...['EJAudioMixerCore.c', 'EJAudioMixerCore.h', 'EJAudioEffects.c', 'EJAudioEffects.h',
		'EJAudioDecodeOgg.c', 'EJAudioDecodeOgg.h'].map((f) => path.join(audio, f)),
	path.join(here, '../../../Source/lib/stb/stb_vorbis.c'),
	path.join(here, 'shim.c'), path.join(here, 'exports.c'),
	...fs.readdirSync(path.join(here, 'include')).sort().map((f) => path.join(here, 'include', f)),
];

export function sourcesHash() {
	const hash = crypto.createHash('sha256');
	// Line endings normalized, so a CRLF checkout hashes the same
	for (const file of files) hash.update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
	return hash.digest('hex');
}

export function wasmIsCurrent() {
	const stamp = path.join(here, 'mixer.wasm.sources');
	return fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === sourcesHash();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	if (process.argv.includes('--check')) {
		if (!wasmIsCurrent()) {
			console.error('mixer.wasm is out of date with the C sources: run tools/ejecta-sim/wasm/build.sh');
			process.exit(1);
		}
		console.log('mixer.wasm is up to date');
	}
	else console.log(sourcesHash());
}
