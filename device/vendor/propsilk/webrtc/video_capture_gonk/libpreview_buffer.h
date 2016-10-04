/*
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#ifndef LIBPREVIEW_BUFFER_H
#define LIBPREVIEW_BUFFER_H

#include "libpreview.h"
#include "webrtc/common_video/include/video_frame_buffer.h"

namespace webrtc {
namespace gonk {

class LibPreviewBuffer: public webrtc::NativeHandleBuffer {
 public:
  LibPreviewBuffer(libpreview::Client* client,
                   void* frame,
                   int32_t frameWidth,
                   int32_t frameHeight,
                   libpreview::FrameOwner frameOwner,
                   int32_t width,
                   int32_t height);
  rtc::scoped_refptr<webrtc::VideoFrameBuffer> NativeToI420Buffer() override;
  rtc::scoped_refptr<LibPreviewBuffer> transfer(int32_t newWidth, int32_t newHeight);

 protected:
  ~LibPreviewBuffer() override;

 private:
  libpreview::Client* client;
  void* frame;
  int32_t frameWidth;
  int32_t frameHeight;
  libpreview::FrameOwner frameOwner;
};

}  // namespace gonk
}  // namespace webrtc

#endif // LIBPREVIEW_BUFFER_H
