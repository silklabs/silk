/**
 * Dumps PCM data from the microphone to stdout.
 * This program cannot be run while silk-capture is active.
 * (Look in logcat for error messages.)
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-mic"
#include <utils/Log.h>
#include <media/stagefright/AudioSource.h>
#include "AudioSourceEmitter.h"

using namespace android;

class Observer: public AudioSourceEmitter::Observer {
public:
  void OnData(bool vad, void *data, size_t size) {
    if (vad) {
      ALOGI("Voice activity detected");
    }
    TEMP_FAILURE_RETRY(write(1, data, size));
    free(data);
  }
};

int main(int argc, char **argv)
{
  // TODO: Commandline arguments to set sample rate, channels, output format
  const int audioChannels = 1;
  const int audioSampleRate = 16000;

  sp<MediaSource> audioSource(
    new AudioSource(
      AUDIO_SOURCE_MIC,
#ifdef TARGET_GE_MARSHMALLOW
      String16("silk-mic"),
#endif
      audioSampleRate,
      audioChannels
    )
  );

  sp<Observer> observer = new Observer();
  audioSource = new AudioSourceEmitter(audioSource, observer,
                                       audioSampleRate, audioChannels);

  status_t err = audioSource->start();
  if (err != 0) {
    ALOGE("Start failed: %d", err);
    return 1;
  }

  for (;;) {
    MediaBuffer *buffer;
    status_t err = audioSource->read(&buffer);
    if (err != ::OK) {
      ALOGE("Error reading from source: %d", err);
      return 1;
    }
    if (buffer == NULL) {
      ALOGE("Failed to get buffer from source");
      return 1;
    }
    buffer->release();
  }
  return 0;
}
