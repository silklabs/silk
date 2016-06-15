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

#include <new>

#include "webrtc/base/refcount.h"
#include "webrtc/base/scoped_ref_ptr.h"
#include "webrtc/modules/video_capture/gonk/video_capture_gonk.h"
#include "webrtc/system_wrappers/include/critical_section_wrapper.h"
#include "webrtc/system_wrappers/include/trace.h"


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

    // Too paranoid?
    if ((int32_t) width != that->_currentWidth ||
        (int32_t) height != that->_currentHeight ||
        kVideoNV21 != that->_captureVideoType) {
      ALOGW("Unexpected frame dimensions/format");
      break;
    }

    VideoCaptureCapability frameInfo;
    frameInfo.width = that->_currentWidth;
    frameInfo.height = that->_currentHeight;
    frameInfo.rawType = that->_captureVideoType;

    auto ret = that->IncomingFrame((unsigned char*) buffer,
                                   width * height * 3/ 2, // Size of a NV21 frame
                                   frameInfo);
    if (ret != 0) {
      ALOGW("IncomingFrame rejected! %d", ret);
    }
  } while (0);

  that->_client->releaseFrame(frameOwner);
}

}  // namespace videocapturemodule
}  // namespace webrtc
