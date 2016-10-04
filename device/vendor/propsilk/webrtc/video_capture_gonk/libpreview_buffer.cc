/*
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#include <stdio.h>

#include "webrtc/base/refcount.h"
#include "webrtc/base/scoped_ref_ptr.h"
#include "webrtc/modules/video_capture/gonk/libpreview_buffer.h"
#include "libyuv.h"

#define LOG_TAG "libpreview_buffer"
#include <utils/Log.h>

namespace webrtc {
namespace gonk {

rtc::scoped_refptr<LibPreviewBuffer> LibPreviewBuffer::transfer(
    int32_t newWidth, int32_t newHeight) {

  rtc::scoped_refptr<LibPreviewBuffer> lpb =
    new rtc::RefCountedObject<LibPreviewBuffer>(
      client,
      frame,
      frameWidth,
      frameHeight,
      frameOwner,
      newWidth,
      newHeight
    );
  client = nullptr; // this object no longer owns the frame
  return lpb;
}

LibPreviewBuffer::LibPreviewBuffer(libpreview::Client* client,
                                   void* frame,
                                   int32_t frameWidth,
                                   int32_t frameHeight,
                                   libpreview::FrameOwner frameOwner,
                                   int32_t width,
                                   int32_t height) :
    NativeHandleBuffer(frame, width, height),
    client(client),
    frame(frame),
    frameWidth(frameWidth),
    frameHeight(frameHeight),
    frameOwner(frameOwner) {
}

LibPreviewBuffer::~LibPreviewBuffer() {
  if (client) {
    client->releaseFrame(frameOwner);
  }
}

rtc::scoped_refptr<webrtc::VideoFrameBuffer> LibPreviewBuffer::NativeToI420Buffer() {
  if (client == nullptr) {
    ALOGW("Called NativeToI420Buffer() with no frame");
    return nullptr;
  }

  rtc::scoped_refptr<I420Buffer> i420Buffer =
    new rtc::RefCountedObject<I420Buffer>(frameWidth, frameHeight);

  libyuv::ConvertToI420(
    (unsigned char *) frame,
    frameWidth * frameHeight * 3 / 2, // Size of a NV21 frame
    (uint8 *) i420Buffer->data(kYPlane), i420Buffer->stride(kYPlane),
    (uint8 *) i420Buffer->data(kUPlane), i420Buffer->stride(kUPlane),
    (uint8 *) i420Buffer->data(kVPlane), i420Buffer->stride(kVPlane),
    0, 0,
    frameWidth, frameHeight,
    i420Buffer->width(), i420Buffer->height(),
    libyuv::kRotate0,
    libyuv::FOURCC_NV21
  );

  if (width() == frameWidth && height() == frameHeight) {
    return i420Buffer;
  }

  // TODO: Resizing doesn't take into account multiple
  //       active peers (we resize for each peer!)
  ALOGV("NativeToI420Buffer scaling from %dx%d to %dx%d",
    frameWidth, frameHeight, width(), height());

  rtc::scoped_refptr<I420Buffer> i420ScaledBuffer =
    new rtc::RefCountedObject<I420Buffer>(width(), height());
  libyuv::I420Scale(
    i420Buffer->data(kYPlane), i420Buffer->stride(kYPlane),
    i420Buffer->data(kUPlane), i420Buffer->stride(kUPlane),
    i420Buffer->data(kVPlane), i420Buffer->stride(kVPlane),
    i420Buffer->width(), i420Buffer->height(),
    (uint8 *) i420ScaledBuffer->data(kYPlane), i420ScaledBuffer->stride(kYPlane),
    (uint8 *) i420ScaledBuffer->data(kUPlane), i420ScaledBuffer->stride(kUPlane),
    (uint8 *) i420ScaledBuffer->data(kVPlane), i420ScaledBuffer->stride(kVPlane),
    i420ScaledBuffer->width(), i420ScaledBuffer->height(),
    libyuv::kFilterNone
  );
  return i420ScaledBuffer;
}

} // namespace gonk
} // namespace webrtc
