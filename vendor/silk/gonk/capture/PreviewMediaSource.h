/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#ifndef PREVIEW_MEDIA_SOURCE_H_
#define PREVIEW_MEDIA_SOURCE_H_

#include <media/stagefright/MediaSource.h>
#include <media/stagefright/foundation/ABase.h>
#include "Channel.h"

/**
 *
 */
class PreviewMediaSource : public MediaSource {
public:
  PreviewMediaSource(Channel *channel, const sp<MediaSource> &source, int skipCount);
  virtual ~PreviewMediaSource();
  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();
  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);

private:
  Channel *mChannel;
  sp<MediaSource> mSource;
  int mSkipCount;
  int mCounter;

  void snapshot(MediaBuffer* img);
  DISALLOW_EVIL_CONSTRUCTORS(PreviewMediaSource);
};

#endif /* PREVIEW_MEDIA_SOURCE_H_ */
