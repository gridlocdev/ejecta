#include "EJAudioDecodeOgg.h"

#include <stdlib.h>
#include <string.h>

#define STB_VORBIS_NO_STDIO
#define STB_VORBIS_NO_PUSHDATA_API
#include "../../lib/stb/stb_vorbis.c"

// Refuse files that would decode to more than this many frames (~1 hour)
#define EJ_OGG_MAX_FRAMES (48000 * 60 * 60)

void EJDecodedAudioFree(EJDecodedAudio *audio) {
	if( audio->channels ) {
		for( int i = 0; i < audio->channelCount; i++ ) { free(audio->channels[i]); }
		free(audio->channels);
	}
	memset(audio, 0, sizeof(*audio));
}

int EJAudioDecodeOggVorbis(const void *data, int size, EJDecodedAudio *audio) {
	memset(audio, 0, sizeof(*audio));
	if( !data || size < 4 || memcmp(data, "OggS", 4) ) { return 0; }
	
	int error = 0;
	stb_vorbis *v = stb_vorbis_open_memory((const unsigned char *)data, size, &error, NULL);
	if( !v ) { return 0; }
	
	stb_vorbis_info info = stb_vorbis_get_info(v);
	unsigned int total = stb_vorbis_stream_length_in_samples(v);
	if( info.channels < 1 || info.sample_rate < 1 || total < 1 || total > EJ_OGG_MAX_FRAMES ) {
		stb_vorbis_close(v);
		return 0;
	}
	
	audio->channelCount = info.channels;
	audio->sampleRate = (int)info.sample_rate;
	audio->channels = calloc(info.channels, sizeof(float *));
	if( !audio->channels ) { stb_vorbis_close(v); return 0; }
	for( int c = 0; c < info.channels; c++ ) {
		audio->channels[c] = calloc(total, sizeof(float));
		if( !audio->channels[c] ) { EJDecodedAudioFree(audio); stb_vorbis_close(v); return 0; }
	}
	
	// Decode in pieces straight into the channel arrays
	float **cursor = calloc(info.channels, sizeof(float *));
	if( !cursor ) { EJDecodedAudioFree(audio); stb_vorbis_close(v); return 0; }
	unsigned int done = 0;
	while( done < total ) {
		for( int c = 0; c < info.channels; c++ ) { cursor[c] = audio->channels[c] + done; }
		int want = total - done > 4096 ? 4096 : (int)(total - done);
		int got = stb_vorbis_get_samples_float(v, info.channels, cursor, want);
		if( got <= 0 ) { break; }
		done += got;
	}
	free(cursor);
	stb_vorbis_close(v);
	
	if( done == 0 ) { EJDecodedAudioFree(audio); return 0; }
	audio->frames = (int)done;
	return 1;
}
