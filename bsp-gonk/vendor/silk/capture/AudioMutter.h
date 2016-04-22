#ifndef AUDIO_MUTTER_H_
#define AUDIO_MUTTER_H_

#include <media/stagefright/foundation/ABase.h>
#include <media/stagefright/MediaSource.h>

using namespace android;

class AudioMutter : public MediaSource {
public:
  AudioMutter(const sp<MediaSource> &source);
  virtual ~AudioMutter();
  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();
  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);

private:
  sp<MediaSource> mSource;
  DISALLOW_EVIL_CONSTRUCTORS(AudioMutter);
};

#endif
