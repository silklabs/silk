#ifndef SLICED_MP4_ECNODER_H_
#define SLICED_MP4_ECNODER_H_

#include <utils/Thread.h>
#include <media/stagefright/foundation/ABase.h>
#include <media/stagefright/foundation/ALooper.h>
#include <media/stagefright/MediaBuffer.h>

#include "Channel.h"

// This is an ugly hack. We forked this from libstagefright
// so we can trigger I-Frame injection.
#include "MediaCodecSource.h"

/**
 *
 */
class SliceListener {
public:
  virtual ~SliceListener() {};
  virtual void handleProgressEvent(int64_t timeUs, bool slice) = 0;
};

/**
 *
 */
class PutBackWrapper : public MediaSource {
public:
  PutBackWrapper(const sp<MediaSource> &source);
  virtual ~PutBackWrapper();
  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();
  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);
  void putBack(MediaBuffer **buffer);

private:
  sp<MediaSource> mSource;
  Vector<MediaBuffer*> mStash;
  bool mDone;

  DISALLOW_EVIL_CONSTRUCTORS(PutBackWrapper);
};

/**
 *
 */
class SliceAudioSource : public MediaSource, public SliceListener {
public:
  SliceAudioSource(const sp<MediaSource> &source);
  virtual ~SliceAudioSource();
  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();
  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);
  virtual void handleProgressEvent(int64_t timeUs, bool slice);

private:
  sp<PutBackWrapper> mSource;
  bool mStarted;
  int64_t mVideoTimeUs;
  Vector<int64_t> mVideoSliceTimes;
  Mutex mLock;
  Condition mWaitForProgress;

  DISALLOW_EVIL_CONSTRUCTORS(SliceAudioSource);
};

/**
 *
 */
class SliceAtEachIDRSource : public MediaSource {
public:
  SliceAtEachIDRSource(const sp<MediaSource> &source);
  virtual ~SliceAtEachIDRSource();
  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();
  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);
  void addListener(SliceListener *listener) { mListeners.push(listener); }

private:
  void notifyListeners(int64_t timeUs, bool slice);
  DISALLOW_EVIL_CONSTRUCTORS(SliceAtEachIDRSource);

  sp<PutBackWrapper> mSource;
  bool mStarted;
  bool mIDRSeen;
  Vector<SliceListener*> mListeners;
};

/**
 *
 */
class SlicedMP4Encoder : public Thread {
  Channel *mChannel;
  sp<ALooper> mLooper;
  sp<SliceAtEachIDRSource> mSlicedVideoSource;
  sp<SliceAudioSource> mSlicedAudioSource;
  sp<MediaCodecSource> mVideoEncoder;
  sp<AMessage> mAudioFormat;

public:
  SlicedMP4Encoder(sp<ALooper> looper, Channel *channel, sp<MediaSource> cameraSource);
  sp<MediaCodecSource> videoEncoder() {return mVideoEncoder;}
  virtual bool threadLoop();
};

#endif
