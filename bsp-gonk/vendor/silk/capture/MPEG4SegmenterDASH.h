#ifndef MPEG4_SEGMENTER_DASH_H_
#define MPEG4_SEGMENTER_DASH_H_

#include <utils/Thread.h>
#include <media/stagefright/foundation/ABase.h>
#include <media/stagefright/foundation/ALooper.h>
#include <media/stagefright/MediaBuffer.h>

#include "Channel.h"

// This is an ugly hack. We forked this from libstagefright
// so we can trigger I-Frame injection.
#include "MediaCodecSource.h"

class PutBackWrapper2;

class MPEG4SegmenterDASH : public Thread {
public:
  MPEG4SegmenterDASH(const sp<MediaSource>& videoEncoder,
                     const sp<MediaSource>& audioEncoder,
                     Channel* channel,
                     bool initialMute);

  virtual bool threadLoop();

  void setMute(bool mute) {
    mAudioMute = mute;
  }
private:
  sp<PutBackWrapper2> mVideoSource;
  sp<PutBackWrapper2> mAudioSource;
  Channel* mChannel;
  bool mAudioMute;

  DISALLOW_EVIL_CONSTRUCTORS(MPEG4SegmenterDASH);
};

#endif
