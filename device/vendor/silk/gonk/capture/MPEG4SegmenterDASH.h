/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: sw=2 ts=2 et :
 */
/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

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
                     Channel* channel);

  virtual bool threadLoop();

private:
  sp<PutBackWrapper2> mVideoSource;
  sp<PutBackWrapper2> mAudioSource;
  Channel* mChannel;

  DISALLOW_EVIL_CONSTRUCTORS(MPEG4SegmenterDASH);
};

#endif
