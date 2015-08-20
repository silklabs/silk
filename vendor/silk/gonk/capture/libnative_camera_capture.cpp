/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "libnative_camera_capture"

#include <binder/IMemory.h>
#include <binder/IServiceManager.h>
#include <binder/ProcessState.h>
#include <camera/ICameraRecordingProxyListener.h>
#include <external/opencv2/modules/androidcamera/camera_wrapper/camera_wrapper.h>
#include <external/opencv2/modules/androidcamera/include/camera_properties.h>
#include <system/camera.h>
#include <utils/Log.h>
#include <utils/String16.h>

#include "IOpenCVCameraCapture.h"

using namespace android;

static size_t framewidth = 0;
static size_t frameheight = 0;
static size_t expectedFrameDataSize = 0;

class OpenCVProxyListener : public BnCameraRecordingProxyListener {
public:
  OpenCVProxyListener(CameraCallback cameraCallback, void *userData)
    : mCameraCallback(cameraCallback), mUserData(userData)
  {
  }

  virtual void dataCallbackTimestamp(nsecs_t timestamp, int32_t msgType,
                                     const sp<IMemory>& data)
  {
    (void) timestamp; // TODO: Forward timestamp to OpenCV
    if (data->size() < expectedFrameDataSize) {
      ALOGE("Video frame too small. Expecting %d, received %d",
        expectedFrameDataSize, data->size());
      return;
    }
    // Provide the 'expectedFrameDataSize' to OpenCV instead of the actual
    // buffer size, which may be slightly bigger due to alignment and is nothing
    // to get upset about (OpenCV insists on only receiving
    // 'expectedFrameDataSize' bytes).
    mCameraCallback(data->pointer(), expectedFrameDataSize, mUserData);
  }
private:
  CameraCallback mCameraCallback;
  void *mUserData;
};

void* initCameraConnectC(void* cameraCallback, int cameraId, void* userData)
{
  sp<ProcessState> ps = ProcessState::self();
  ps->startThreadPool();

  sp<IServiceManager> sm = defaultServiceManager();
  sp<IBinder> binder = sm->getService(String16("libnative_camera_capture"));
  if (binder == NULL) {
    ALOGE("Unable to connect with capture preview service");
    return NULL;
  }
  sp<IOpenCVCameraCapture> wrapper = interface_cast<IOpenCVCameraCapture>(binder);
  status_t err = wrapper->initCamera(cameraId,
    new OpenCVProxyListener((CameraCallback) cameraCallback, userData));

  if (err != OK) {
    ALOGW("initCameraConnectC: camera init failed: %d", err);
    return NULL;
  }

  wrapper->incStrong(NULL);
  return wrapper.get();
}

void closeCameraConnectC(void** camera)
{
  IOpenCVCameraCapture* wrapper = *(IOpenCVCameraCapture **) camera;

  if (wrapper != NULL) {
    wrapper->closeCamera();
    wrapper->decStrong(NULL);
    *camera = NULL;
  }
}

double getCameraPropertyC(void* camera, int id)
{
  IOpenCVCameraCapture* wrapper = (IOpenCVCameraCapture *) camera;

  // Handle the scary string hidden within the double locally
  // (NV21 is the only supported format anyway)
  if (id == ANDROID_CAMERA_PROPERTY_PREVIEW_FORMAT_STRING) {
    union {double d; const char *str;} hack;
    hack.str = "yvu420sp";
    return hack.d;
  }

  double value = 0;
  if (wrapper != NULL) {
    value = wrapper->getProperty(id);
  }

  switch (id) {
  case ANDROID_CAMERA_PROPERTY_FRAMEWIDTH:
    framewidth = value;
    break;
  case ANDROID_CAMERA_PROPERTY_FRAMEHEIGHT:
    frameheight = value;
    break;
  default:
    break;
  }
  expectedFrameDataSize = framewidth * (3 * frameheight / 2);

  return value;
}

void setCameraPropertyC(void* camera, int id, double value)
{
  IOpenCVCameraCapture* wrapper = (IOpenCVCameraCapture *) camera;
  if (wrapper != NULL) {
    wrapper->setProperty(id, value);
  }
}

void applyCameraPropertiesC(void** camera)
{
  IOpenCVCameraCapture* wrapper = *(IOpenCVCameraCapture **) camera;
  if (wrapper != NULL) {
    wrapper->applyProperties();
  }
}
