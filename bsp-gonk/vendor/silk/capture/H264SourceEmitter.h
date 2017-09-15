#pragma once

#include <media/stagefright/foundation/ABase.h>
#include <media/stagefright/MediaSource.h>
#include <utils/StrongPointer.h>

using namespace android;
namespace capture {
namespace datasocket {
class Channel;
}
}

class H264SourceEmitter: public MediaSource {
 public:
  H264SourceEmitter(
    const sp<MediaSource> &source,
    capture::datasocket::Channel *channel
  );
  virtual ~H264SourceEmitter();
  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();
  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);

private:
  sp<MediaSource> mSource;
  capture::datasocket::Channel *mChannel;
  uint8_t *mCodecConfig;
  int mCodecConfigLength;

  DISALLOW_EVIL_CONSTRUCTORS(H264SourceEmitter);
};

