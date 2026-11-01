// Decodes Ogg Vorbis files, which AVAudioFile can't read, with stb_vorbis
// (Source/lib/stb). Plain C.

#ifndef EJAudioDecodeOgg_h
#define EJAudioDecodeOgg_h

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
	float **channels; // planar samples, channelCount arrays of frames
	int channelCount;
	int frames;
	int sampleRate;
} EJDecodedAudio;

// Returns 1 and fills audio on success; free it with EJDecodedAudioFree().
// Returns 0 for anything that isn't Ogg Vorbis (e.g. Ogg Opus) or is damaged.
int EJAudioDecodeOggVorbis(const void *data, int size, EJDecodedAudio *audio);
void EJDecodedAudioFree(EJDecodedAudio *audio);

#ifdef __cplusplus
}
#endif

#endif
