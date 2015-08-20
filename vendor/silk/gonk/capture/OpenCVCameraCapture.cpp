/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#define LOG_NDEBUG 0
#define LOG_TAG "OpenCVCameraCapture"

#include <binder/BinderService.h>
#include <binder/ProcessState.h>
#include <camera/ICameraRecordingProxy.h>
#include <camera/ICameraRecordingProxyListener.h>
#include <system/camera.h>
#include <utils/Log.h>
#include <external/opencv2/modules/androidcamera/camera_wrapper/camera_wrapper.h> 
#include <external/opencv2/modules/androidcamera/include/camera_properties.h>

#include "Capturedefs.h"
#include "OpenCVCameraCapture.h"

using namespace android;

status_t OpenCVCameraCapture::publish()
{
  return BinderService::publish();
}

OpenCVCameraCapture::OpenCVCameraCapture() : BnOpenCVCameraCapture()
{
}

OpenCVCameraCapture::~OpenCVCameraCapture()
{
  closeCamera();
}


status_t OpenCVCameraCapture::initCamera(int cameraId,
  const sp<ICameraRecordingProxyListener>& listener)
{
  if (cameraId != 0) {
    return BAD_VALUE;
  }
  if (appListener != NULL) {
    // TODO: Technically there's no reason why multiple camera users couldn't
    //      be supported, this just isn't implemented yet.
    return ALREADY_EXISTS;
  }
  setListener(listener);
  return ::OK;
}

void OpenCVCameraCapture::closeCamera()
{
  ALOGE("OpenCVCameraCapture closeCamera");
  setListener(NULL);
}

double OpenCVCameraCapture::getProperty(int id)
{
  switch (id) {
  case ANDROID_CAMERA_PROPERTY_FRAMEWIDTH:
    return sVideoSize.width;
  case ANDROID_CAMERA_PROPERTY_FRAMEHEIGHT:
    return sVideoSize.height;
  default:
    ALOGW("getProperty: unsupported property: id=%d", id);
    return 0;
  }
}

void OpenCVCameraCapture::setProperty(int id, double value)
{
  ALOGW("setProperty: unsupported property: id=%d", id);
}

void OpenCVCameraCapture::applyProperties()
{
  // If and when properties become writable, apply them here...
}

void OpenCVCameraCapture::setListener(const sp<ICameraRecordingProxyListener>& listener)
{
  if (appListener != NULL) {
    sp<IBinder> binder = appListener->asBinder();
    binder->unlinkToDeath(this);
    appListener = NULL;
  }
  if (listener != NULL) {
    appListener = listener;
    sp<IBinder> binder = appListener->asBinder();
    binder->linkToDeath(this);
  }
}

sp<ICameraRecordingProxyListener> OpenCVCameraCapture::appListener = NULL;

void OpenCVCameraCapture::frameCallback(nsecs_t timestamp, const sp<IMemory>& data)
{
  // TODO: On the OpenCV side there is an unnecessary memcpy() of the entire
  //       frame data happening within CvCapture_Android::setFrame().  This
  //       could be avoided by changing OpenCVCameraRecordingProxy to retain
  //       ownership of the IMemory until the next VideoCapture::grab() as
  //       well as corresponding changes within cap_android.cpp
  //
  //       Additionally if VideoCapture is not currently waiting for a new frame
  //       it will be good to avoid the unnecessary IPC call here that provides
  //       VideoCapture with a frame that it's going to probably ignore.
  if (appListener != NULL) {
    appListener->dataCallbackTimestamp(timestamp, CAMERA_MSG_VIDEO_FRAME, data);
  }
}

