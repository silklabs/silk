/*
 *  Copyright (c) 2012 The WebRTC project authors. All Rights Reserved.
 *  Copyright (c) 2016 Silk Labs, Inc. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#include <stdio.h>
#include <string.h>
#include <time.h>

#include <new>

#include "webrtc/base/refcount.h"
#include "webrtc/base/scoped_ref_ptr.h"
#include "webrtc/modules/video_capture/gonk/video_capture_gonk.h"
#include "webrtc/system_wrappers/include/critical_section_wrapper.h"
#include "webrtc/system_wrappers/include/trace.h"
#include "libyuv.h"

static int64_t uptimeMs() {
  struct timespec t;
  t.tv_sec = t.tv_nsec = 0;
  clock_gettime(CLOCK_MONOTONIC, &t);
  return int64_t(t.tv_sec) * 1000LL + t.tv_nsec / 1000000;
}

namespace webrtc {
namespace videocapturemodule {
rtc::scoped_refptr<VideoCaptureModule> VideoCaptureImpl::Create(
    const int32_t id,
    const char* deviceUniqueId) {

  rtc::scoped_refptr<VideoCaptureModuleGonk> implementation(
    new rtc::RefCountedObject<VideoCaptureModuleGonk>(id));

  if (implementation->Init(deviceUniqueId) != 0) {
    return nullptr;
  }

  return implementation;
}

VideoCaptureModuleGonk::VideoCaptureModuleGonk(const int32_t id)
    : VideoCaptureImpl(id),
      _captureCritSect(CriticalSectionWrapper::CreateCriticalSection()),
      _client(nullptr),
      _currentWidth(-1),
      _currentHeight(-1),
      _currentFrameRate(-1),
      _currentFrameIntervalMs(-1),
      _lastFrameMs(-1),
      _captureStarted(false),
      _captureVideoType(kVideoI420)
{
}

int32_t VideoCaptureModuleGonk::Init(const char* deviceUniqueIdUTF8)
{
  if (strcmp(deviceUniqueIdUTF8, "0") != 0) {
    ALOGE("Unknown device ID: %s", deviceUniqueIdUTF8);
    return -1;
  }
  return 0;
}

VideoCaptureModuleGonk::~VideoCaptureModuleGonk()
{
  StopCapture();
  if (_captureCritSect) {
    delete _captureCritSect;
    _captureCritSect = nullptr;
  }
}

int32_t VideoCaptureModuleGonk::StartCapture(
    const VideoCaptureCapability& capability)
{
  if (_captureStarted) {
    if (capability.width == _currentWidth &&
        capability.height == _currentHeight &&
        _captureVideoType == capability.rawType) {
      return 0;
    } else {
      StopCapture();
    }
  }

  CriticalSectionScoped cs(_captureCritSect);

  _currentWidth = capability.width;
  _currentHeight = capability.height;
  _captureVideoType = capability.rawType;
  _captureDelay = capability.expectedCaptureDelay;
  _currentFrameRate = capability.maxFPS;
  if (capability.maxFPS <= 0) {
    ALOGE("Invalid maxFPS: %d", capability.maxFPS);
    return -1;
  }
  _currentFrameIntervalMs = 1000 / _currentFrameRate;
  ALOGI("Target framerate: %dFPS (%dms interval)",
    _currentFrameRate, _currentFrameIntervalMs);
  _lastFrameMs = 0;

  this->_client = libpreview::open(OnFrameCallback, OnAbandonedCallback, this);
  if (this->_client == nullptr) {
    ALOGE("Failed to open libpreview");
    return -1;
  }
  _captureStarted = true;
  return 0;
}

int32_t VideoCaptureModuleGonk::StopCapture()
{
  CriticalSectionScoped cs(_captureCritSect);

  if (_captureStarted) {
    _captureStarted = false;
    delete _client;
  }
  return 0;
}

bool VideoCaptureModuleGonk::CaptureStarted()
{
  return _captureStarted;
}

int32_t VideoCaptureModuleGonk::CaptureSettings(VideoCaptureCapability& settings)
{
  settings.width = _currentWidth;
  settings.height = _currentHeight;
  settings.maxFPS = _currentFrameRate;
  settings.rawType = _captureVideoType;
  return 0;
}

void VideoCaptureModuleGonk::OnAbandonedCallback(void *userData) {
  VideoCaptureModuleGonk *that = static_cast<VideoCaptureModuleGonk*>(userData);
  ALOGE("Welp, now what?");
}

void VideoCaptureModuleGonk::OnFrameCallback(void *userData,
                                             void* buffer,
                                             libpreview::FrameFormat format,
                                             size_t width,
                                             size_t height,
                                             libpreview::FrameOwner frameOwner) {
  VideoCaptureModuleGonk *that = static_cast<VideoCaptureModuleGonk*>(userData);
  CriticalSectionScoped cs(that->_captureCritSect);

  do {
    if (!that->_captureStarted) {
      break;
    }

    if (format != libpreview::FRAMEFORMAT_YVU420SP) {
      ALOGW("Unsupported frame format: %d", format);
      break;
    }
    size_t bufferSize = width * height * 3 / 2; // Size of a NV21 frame

    const auto now = uptimeMs();
    const auto timeSinceLastFrame = now - that->_lastFrameMs;
    if (timeSinceLastFrame < that->_currentFrameIntervalMs) {
      ALOGI("Not ready for frame yet: %dms remaining",
        (int)(that->_currentFrameIntervalMs - timeSinceLastFrame));
      break;
    }
    that->_lastFrameMs = now;

    VideoCaptureCapability frameInfo;
    frameInfo.width = that->_currentWidth;
    frameInfo.height = that->_currentHeight;
    frameInfo.rawType = that->_captureVideoType;

    int ret = -1;

    // Need to resize?
    if ((int32_t) width != frameInfo.width ||
        (int32_t) height != frameInfo.height) {

      if (kVideoI420 != that->_captureVideoType) {
        ALOGW("Unexpected capture frame format");
        break;
      }

      // TODO: Resizing is very slow, and doesn't take into account multiple
      //       active peers (we resize for each peer!)
      ALOGI("Slow scaling from %dx%d to %dx%d",
        width, height, frameInfo.width, frameInfo.height);

      // Convert from NV21 to I420
      size_t buffer420Size = bufferSize; // I420 frame size == NV21 frame size
      unsigned char *buffer420 = (unsigned char *) malloc(buffer420Size);
      int src_stride_y = width;
      int src_stride_v = width / 2;
      int src_stride_u = src_stride_v;
      uint8* src_y = buffer420;
      uint8* src_u = src_y + height * src_stride_y;
      uint8* src_v = src_u + height / 2 * src_stride_u;

      libyuv::ConvertToI420(
        (unsigned char *) buffer,
        bufferSize,
        src_y, src_stride_y,
        src_u, src_stride_u,
        src_v, src_stride_v,
        0, 0,
        width, height,
        width, height,
        libyuv::kRotate0,
        libyuv::FOURCC_NV21
      );

      // Resize I420 frame to desired dimensions
      size_t destBuffer420Size = frameInfo.width * frameInfo.height * 3 / 2;
      unsigned char *destBuffer420 = (unsigned char *) malloc(destBuffer420Size);
      int dst_stride_y = frameInfo.width;
      int dst_stride_u = frameInfo.width / 2;
      int dst_stride_v = dst_stride_u;
      uint8* dst_y = destBuffer420;
      uint8* dst_u = dst_y + frameInfo.height * dst_stride_y;
      uint8* dst_v = dst_u + frameInfo.height / 2 * dst_stride_v;

      libyuv::I420Scale(
        src_y, src_stride_y,
        src_u, src_stride_u,
        src_v, src_stride_v,
        width, height,
        dst_y, dst_stride_y,
        dst_u, dst_stride_u,
        dst_v, dst_stride_v,
        frameInfo.width, frameInfo.height,
        libyuv::kFilterNone
      );

      free(buffer420);
      ret = that->IncomingFrame(destBuffer420, destBuffer420Size, frameInfo);
      free(destBuffer420);
    } else {
      if (kVideoNV21 != that->_captureVideoType) {
        ALOGW("Unexpected capture frame format");
        break;
      }
      ret = that->IncomingFrame((unsigned char*) buffer, bufferSize, frameInfo);
    }
    if (ret != 0) {
      ALOGW("IncomingFrame rejected! %d", ret);
    }
  } while (0);

  that->_client->releaseFrame(frameOwner);
}

}  // namespace videocapturemodule
}  // namespace webrtc
