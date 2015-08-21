/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "OpenCVCameraRecordingProxy"

#include <camera/ICameraRecordingProxyListener.h>
#include <system/camera.h>
#include <utils/Log.h>

#include "OpenCVCameraRecordingProxy.h"
#include "OpenCVCameraCapture.h"

using namespace android;

class CameraRecordingProxyListener : public BnCameraRecordingProxyListener {
public:
  CameraRecordingProxyListener(const sp<ICameraRecordingProxyListener>& aProxyListener)
    : mProxyListener(aProxyListener)
  {
  }

  virtual void dataCallbackTimestamp(nsecs_t timestamp, int32_t msgType,
                                     const sp<IMemory>& data) {

    if (msgType == CAMERA_MSG_VIDEO_FRAME) {
      OpenCVCameraCapture::frameCallback(timestamp, data);
    }
    mProxyListener->dataCallbackTimestamp(timestamp, msgType, data);
  }
private:
  sp<ICameraRecordingProxyListener> mProxyListener;
};


OpenCVCameraRecordingProxy::OpenCVCameraRecordingProxy(const sp<ICameraRecordingProxy>& aProxy)
  : mProxy(aProxy)
{
  status_t err = OpenCVCameraCapture::publish();
  if (err != 0) {
    ALOGE("Unable to publish OpenCVCameraCapture service: %d", err);
  }
}

status_t OpenCVCameraRecordingProxy::startRecording(const sp<ICameraRecordingProxyListener>& listener)
{
  return mProxy->startRecording(new CameraRecordingProxyListener(listener));
}

void OpenCVCameraRecordingProxy::stopRecording()
{
  mProxy->stopRecording();
}

void OpenCVCameraRecordingProxy::releaseRecordingFrame(const sp<IMemory>& mem)
{
  mProxy->releaseRecordingFrame(mem);
}

