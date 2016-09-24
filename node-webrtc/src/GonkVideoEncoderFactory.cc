/*
 *  Copyright 2015 The WebRTC project authors. All Rights Reserved.
 *  Copyright 2016 Silk Labs Inc. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#include "GonkVideoEncoderFactory.h"
#include "GonkVideoEncoder.h"
#include "webrtc/common_types.h"

#define LOG_TAG "silk-gonkvencfactory"
#include <log/log.h>

using webrtc::VideoCodecType;
using webrtc::VideoCodec;
using webrtc::VideoEncoder;
using webrtc::kVideoCodecH264;

#define MAX_VIDEO_WIDTH 1280
#define MAX_VIDEO_HEIGHT 1280
#define MAX_VIDEO_FPS 30

GonkVideoEncoderFactory::GonkVideoEncoderFactory() {
  ALOGD("GonkVideoEncoderFactory ctor");

  supported_codecs_.clear();
  supported_codecs_.push_back(VideoCodec(kVideoCodecH264, "H264",
      MAX_VIDEO_WIDTH, MAX_VIDEO_HEIGHT, MAX_VIDEO_FPS));
}

GonkVideoEncoderFactory::~GonkVideoEncoderFactory() {
}

webrtc::VideoEncoder* GonkVideoEncoderFactory::CreateVideoEncoder(
    VideoCodecType type) {

  return GonkVideoEncoder::Create(type);
}

const std::vector<GonkVideoEncoderFactory::VideoCodec>& GonkVideoEncoderFactory::codecs() const {
  return supported_codecs_;
}

void GonkVideoEncoderFactory::DestroyVideoEncoder(VideoEncoder* encoder) {
  ALOGD("GonkVideoEncoderFactory::DestroyVideoEncoder");
  delete encoder;
}
