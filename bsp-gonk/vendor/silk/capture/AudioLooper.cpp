//#define LOG_NDEBUG 0
#define LOG_TAG "capture"

#include <media/stagefright/MediaBuffer.h>
#include <log/log.h>
#include "AudioLooper.h"

using namespace android;

AudioLooper::AudioLooper(const sp<MediaSource> &source) :
    mSource(source) {
}

bool AudioLooper::threadLoop() {
  mSource->start();

  while (true) {
    MediaBuffer *buffer;
    status_t err = mSource->read(&buffer);

    if (err == OK && buffer) {
      // When this loop is running, we're pulling audio samples purely
      // for the side effect of AudioSourceEmitter (our `mSource`
      // here) sending audio samples back to the audio analysis code.
      // So the buffers aren't needed.
      buffer->release();
      buffer = NULL;
    }
  }
  return true;
}
