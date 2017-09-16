#pragma once

#include <media/stagefright/foundation/ABase.h>
#include <utils/StrongPointer.h>

#include "MediaCodecSource.h"

using namespace android;
namespace capture {
namespace datasocket {
class Channel;
}
}

class H264SourceEmitter: public MediaSource {
 public:
  H264SourceEmitter(
    const sp<MediaCodecSource> &source,
    capture::datasocket::Channel *channel,
    int preferredBitrate
  );
  virtual ~H264SourceEmitter();
  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();
  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);

private:
  sp<MediaCodecSource> mSource;
  capture::datasocket::Channel *mChannel;
  int mPreferredBitrate;
  uint8_t *mCodecConfig;
  int mCodecConfigLength;

  DISALLOW_EVIL_CONSTRUCTORS(H264SourceEmitter);
};

