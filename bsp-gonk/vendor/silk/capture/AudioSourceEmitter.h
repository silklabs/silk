#ifndef AUDIO_SOURCE_EMITTER_H_
#define AUDIO_SOURCE_EMITTER_H_

#include <media/stagefright/foundation/ABase.h>
#include <media/stagefright/MediaSource.h>
#include "Channel.h"

class AudioSourceEmitter : public MediaSource {
public:
  AudioSourceEmitter(Channel *channel, const sp<MediaSource> &source);
  virtual ~AudioSourceEmitter();
  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();
  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);

private:
  Channel *mChannel;
  sp<MediaSource> mSource;
  DISALLOW_EVIL_CONSTRUCTORS(AudioSourceEmitter);

  uint8_t *mAudioBuffer;
  uint32_t mAudioBufferIdx;
  uint32_t mAudioBufferLen;
};

#endif
