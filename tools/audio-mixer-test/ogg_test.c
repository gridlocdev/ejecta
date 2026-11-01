// Tests for Source/Ejecta/EJAudio/EJAudioDecodeOgg.c: just test-mixer
// The .ogg files in data/ were made with ffmpeg (a 440 Hz sine at half level).
#include "EJAudioDecodeOgg.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>

static int failures = 0;
#define CHECK(cond, ...) do { if( !(cond) ) { failures++; \
	printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while(0)

static unsigned char *readFile(const char *path, int *size) {
	FILE *f = fopen(path, "rb");
	if( !f ) { printf("FAIL can't open %s\n", path); failures++; *size = 0; return NULL; }
	fseek(f, 0, SEEK_END);
	*size = (int)ftell(f);
	fseek(f, 0, SEEK_SET);
	unsigned char *data = malloc(*size);
	if( fread(data, 1, *size, f) != (size_t)*size ) { *size = 0; }
	fclose(f);
	return data;
}

int main(int argc, char **argv) {
	const char *dir = argc > 1 ? argv[1] : "tools/audio-mixer-test/data";
	char path[512];
	int size;
	EJDecodedAudio audio;
	
	snprintf(path, sizeof(path), "%s/tone-440hz-stereo.ogg", dir);
	unsigned char *data = readFile(path, &size);
	CHECK(EJAudioDecodeOggVorbis(data, size, &audio), "decodes Vorbis");
	CHECK(audio.channelCount == 2 && audio.sampleRate == 44100, "stereo 44.1 kHz: %d %d", audio.channelCount, audio.sampleRate);
	CHECK(abs(audio.frames - 22050) < 200, "half a second: %d frames", audio.frames);
	float peak = 0;
	int crossings = 0;
	for( int i = 1000; i < audio.frames - 1000; i++ ) {
		peak = fmaxf(peak, fabsf(audio.channels[1][i]));
		if( (audio.channels[0][i-1] < 0) != (audio.channels[0][i] < 0) ) { crossings++; }
	}
	double hz = crossings / 2.0 / ((audio.frames - 2000) / 44100.0);
	CHECK(fabsf(peak - .5f) < .05f, "half level: %f", peak);
	CHECK(fabs(hz - 440) < 5, "440 Hz: %f", hz);
	EJDecodedAudioFree(&audio);
	
	// A cut-off file decodes what's there or fails, without reading past the end
	EJDecodedAudio part;
	int ok = EJAudioDecodeOggVorbis(data, size / 2, &part);
	CHECK(!ok || part.frames < 22050, "truncated file");
	EJDecodedAudioFree(&part);
	CHECK(!EJAudioDecodeOggVorbis(data, 3, &part), "too short");
	free(data);
	
	snprintf(path, sizeof(path), "%s/tone-opus.ogg", dir);
	data = readFile(path, &size);
	CHECK(!EJAudioDecodeOggVorbis(data, size, &audio), "Opus in Ogg is left to the system decoder");
	free(data);
	
	unsigned char junk[64] = "OggS and then nothing that makes sense";
	CHECK(!EJAudioDecodeOggVorbis(junk, sizeof(junk), &audio), "junk");
	
	printf(failures ? "%d FAILED\n" : "all ogg tests passed\n", failures);
	return failures != 0;
}
