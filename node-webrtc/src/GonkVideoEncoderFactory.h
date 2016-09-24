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

#ifndef GONKVIDEOENCODERFACTORY_H
#define GONKVIDEOENCODERFACTORY_H

#include <vector>

#include "webrtc/media/engine/webrtcvideoencoderfactory.h"

class GonkVideoEncoderFactory
    : public cricket::WebRtcVideoEncoderFactory {
 public:
  GonkVideoEncoderFactory();
  virtual ~GonkVideoEncoderFactory();

  webrtc::VideoEncoder* CreateVideoEncoder(webrtc::VideoCodecType type)
      override;
  const std::vector<GonkVideoEncoderFactory::VideoCodec>& codecs() const override;
  void DestroyVideoEncoder(webrtc::VideoEncoder* encoder) override;

 private:
  std::vector<VideoCodec> supported_codecs_;
};

#endif // GONKVIDEOENCODERFACTORY_H
