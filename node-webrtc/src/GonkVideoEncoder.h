#ifndef GONKVIDEOENCODER_H
#define GONKVIDEOENCODER_H

#include "webrtc/common_types.h"
#include "webrtc/video_encoder.h"

using webrtc::VideoEncoder;
using webrtc::VideoCodecType;

class GonkVideoEncoder: public VideoEncoder {
 public:
  static VideoEncoder* Create(VideoCodecType codec_type);
};

#endif
