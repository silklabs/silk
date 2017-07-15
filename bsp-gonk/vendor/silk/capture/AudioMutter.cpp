#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture-audio-mutter"
#include <log/log.h>

#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/MetaData.h>
#include <media/stagefright/AudioSource.h>

#include "AudioMutter.h"


AudioMutter::AudioMutter(const sp<MediaSource> &source, bool initialMute) :
    mSource(source), mAudioMute(initialMute) {
}

AudioMutter::~AudioMutter() {
}

status_t AudioMutter::start(MetaData *params) {
  return mSource->start(params);
}

status_t AudioMutter::stop() {
  return mSource->stop();
}

sp<MetaData> AudioMutter::getFormat() {
  return mSource->getFormat();
}

status_t AudioMutter::read(MediaBuffer **buffer,
    const ReadOptions *options) {
  status_t err = mSource->read(buffer, options);

  if (err == OK && (*buffer) && (*buffer)->range_length()) {
    if (mAudioMute) {
      // Mute is set, replace with "silence" samples
      memset((uint8_t *) (*buffer)->data() + (*buffer)->range_offset(), 0,
          (*buffer)->range_length());
    }
  }
  return err;
}

