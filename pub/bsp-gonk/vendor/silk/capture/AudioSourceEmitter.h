#ifndef AUDIO_SOURCE_EMITTER_H_
#define AUDIO_SOURCE_EMITTER_H_

#include <media/stagefright/foundation/ABase.h>
#include <media/stagefright/MediaSource.h>
#include <utils/StrongPointer.h>

using namespace android;

class AudioSourceEmitter: public MediaSource {
public:

  class Observer: public RefBase {
  public:
    // The implementation is responsible for free()-ing data
    virtual void OnData(bool vad, void *data, size_t size) = 0;
  };

  AudioSourceEmitter(const sp<MediaSource> &source,
                     sp<Observer> observer,
                     int audioSampleRate,
                     int audioChannels,
                     bool vadEnabled = false);

  virtual ~AudioSourceEmitter();
  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();
  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);

private:
  sp<Observer> mObserver;
  sp<MediaSource> mSource;
  DISALLOW_EVIL_CONSTRUCTORS(AudioSourceEmitter);

  bool mVadEnabled;
  bool vadCheck();

  uint8_t *mAudioBuffer;
  uint32_t mAudioBufferIdx;
  uint32_t mAudioBufferLen;
  bool mAudioBufferVad;
};

#endif
