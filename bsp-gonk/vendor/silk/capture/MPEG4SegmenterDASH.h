#pragma once

#include <utils/Thread.h>
#include <utils/StrongPointer.h>
#include <media/stagefright/foundation/ABase.h>
#include <media/stagefright/foundation/ALooper.h>
#include <media/stagefright/MediaBuffer.h>
#include <media/stagefright/MediaCodec.h>

// This is an ugly hack. We forked this from libstagefright
// so we can trigger I-Frame injection.
#include "MediaCodecSource.h"

class PutBackWrapper2;
namespace capture {
namespace datasocket {
class Channel;
}
}

using namespace android;
class MPEG4SegmenterDASH : public Thread {
public:
  MPEG4SegmenterDASH(
    const sp<MediaSource>& videoMediaSource,
    const sp<MediaCodec>& videoMediaCodec,
    int framesPerVideoSegment,
    const sp<MediaSource>& audioMediaSource,
    capture::datasocket::Channel* channel,
    bool initalMute
  );

  virtual bool threadLoop();

  void setMute(bool mute) {
    mAudioMute = mute;
  }
private:
  sp<PutBackWrapper2> mVideoSource;
  sp<PutBackWrapper2> mAudioSource;
  capture::datasocket::Channel* mChannel;
  bool mAudioMute;
  const sp<MediaCodec> mVideoMediaCodec;
  int mFramesPerVideoSegment;

  DISALLOW_EVIL_CONSTRUCTORS(MPEG4SegmenterDASH);
};

