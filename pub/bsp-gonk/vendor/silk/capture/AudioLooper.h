#ifndef AUDIO_LOOPER_H_
#define AUDIO_LOOPER_H_

#include <utils/Thread.h>
#include <media/stagefright/MediaSource.h>

using namespace android;

class AudioLooper : public Thread {
public:
  AudioLooper(const sp<MediaSource> &source);
  virtual bool threadLoop();

private:
  sp<MediaSource> mSource;
};

#endif
