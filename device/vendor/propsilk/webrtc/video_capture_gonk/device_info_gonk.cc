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

#include "webrtc/modules/video_capture/gonk/device_info_gonk.h"
#include "webrtc/system_wrappers/include/trace.h"

#define LOG_TAG "device_info_gonk"
#include <utils/Log.h>
#include <cutils/properties.h>

namespace webrtc
{
namespace videocapturemodule
{

VideoCaptureModule::DeviceInfo* VideoCaptureImpl::CreateDeviceInfo(const int32_t id)
{
  return new videocapturemodule::DeviceInfoGonk(id);
}

DeviceInfoGonk::DeviceInfoGonk(const int32_t id) : DeviceInfoImpl(id)
{
}

int32_t DeviceInfoGonk::Init()
{
  return 0;
}

DeviceInfoGonk::~DeviceInfoGonk()
{
}

uint32_t DeviceInfoGonk::NumberOfDevices()
{
  return 1;
}

int32_t DeviceInfoGonk::GetDeviceName(uint32_t deviceNumber,
                                      char* deviceNameUTF8,
                                      uint32_t deviceNameLength,
                                      char* deviceUniqueIdUTF8,
                                      uint32_t deviceUniqueIdUTF8Length,
                                      char* /*productUniqueIdUTF8*/,
                                      uint32_t /*productUniqueIdUTF8Length*/)
{
  if (deviceNumber != 0) {
    return -1;
  }

  memset(deviceNameUTF8, 0, deviceNameLength);
  strlcpy(deviceNameUTF8, "silk-capture", deviceNameLength - 1);
  memset(deviceUniqueIdUTF8, 0, deviceUniqueIdUTF8Length);
  strlcpy(deviceUniqueIdUTF8, "0", deviceUniqueIdUTF8Length - 1);
  return 0;
}

int32_t DeviceInfoGonk::CreateCapabilityMap(const char* deviceUniqueIdUTF8)
{
  if (strcmp(deviceUniqueIdUTF8, "0") != 0) {
    ALOGE("Unknown device ID: %s", deviceUniqueIdUTF8);
    return -1;
  }

  _captureCapabilities.clear();

  VideoCaptureCapability capFull;
  capFull.width = property_get_int32("ro.silk.camera.width", 1280);
  capFull.height = property_get_int32("ro.silk.camera.height", 720);
  capFull.maxFPS = property_get_int32("ro.silk.camera.fps", 24);
  capFull.rawType = kVideoNV21;
  capFull.expectedCaptureDelay =
    webrtc::videocapturemodule::kDefaultCaptureDelay;
  _captureCapabilities.push_back(capFull);

  VideoCaptureCapability capPreview;
  capPreview.width = property_get_int32("ro.silk.preview.width", 320);
  capPreview.height = property_get_int32("ro.silk.preview.height", 180);
  capPreview.maxFPS = 1;
  capPreview.rawType = kVideoI420;
  capPreview.expectedCaptureDelay =
    webrtc::videocapturemodule::kDefaultCaptureDelay;
  _captureCapabilities.push_back(capPreview);

  return _captureCapabilities.size();
}

}  // namespace videocapturemodule
}  // namespace webrtc
