/**
 * Dumps PCM data from the microphone to stdout.
 * This program cannot be run while silk-capture is active.
 */

#include <fcntl.h>
#include <unistd.h>
#include <media/stagefright/AudioSource.h>
#include "AudioSourceEmitter.h"

using namespace android;

static int fd;

class Observer: public AudioSourceEmitter::Observer {
public:
  void OnData(bool vad, void *data, size_t size) {
    if (vad) {
      ALOGI("Voice activity detected\n");
    }
    TEMP_FAILURE_RETRY(write(fd, data, size));
    printf(".\n");
    free(data);
  }
};

int main(int argc, char **argv)
{
  // TODO: Commandline arguments to set sample rate, channels, output format
  const int audioChannels = 1;
  const int audioSampleRate = 16000;

  const char *file = "/data/pcm";
  if (argc > 1) {
    file = argv[1];
  }
  printf("Writing PCM data to %s\n", file);
  fd = open(file, O_WRONLY | O_CREAT, 0440);
  if (fd < 0) {
    perror(NULL);
    return errno;
  }
  printf("^C to stop\n");

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
    printf("Start failed: %d\n", err);
    return 1;
  }

  for (;;) {
    MediaBuffer *buffer;
    status_t err = audioSource->read(&buffer);
    if (err != ::OK) {
      printf("Error reading from source: %d\n", err);
      return 1;
    }
    if (buffer == NULL) {
      printf("Failed to get buffer from source\n");
      return 1;
    }
    buffer->release();
  }
  return 0;
}
