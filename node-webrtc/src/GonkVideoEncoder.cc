#define LOG_TAG "silk-gonkvenc"
#include <log/log.h>
#include "GonkVideoEncoder.h"
#include "webrtc/modules/video_coding/codecs/h264/include/h264.h"

using webrtc::kVideoCodecH264;
using webrtc::H264Encoder;

VideoEncoder* GonkVideoEncoder::Create(VideoCodecType codec_type) {
  switch (codec_type) {
  case kVideoCodecH264:
    if (H264Encoder::IsSupported()) {
      return H264Encoder::Create();
    }
    //fall through
  default:
    ALOGI("VideoCodecType %d not supported", (int) codec_type);
    return nullptr;
  }
}
