/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#define LOG_NDEBUG 0
#define LOG_TAG "OpenCVCameraCapture"

#include <binder/BinderService.h>
#include <binder/ProcessState.h>
#include <system/camera.h>
#include <utils/Log.h>

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

status_t OpenCVCameraCapture::initCamera(int cameraId, const sp<IGraphicBufferProducer>& producer)
{
  ALOGE("OpenCVCameraCapture initCamera");
  if (cameraId != 0) {
    return BAD_VALUE;
  }
  if (sPreviewProducer != NULL) {
    // TODO: Maybe handle this better by restarting the recording?  It means
    // node crashed, which at the moment means that capture is restarted as
    // well, so not a big problem right now.
    ALOGE("Error: sPreviewProducer already set");
    return ALREADY_EXISTS;
  }
  sPreviewProducer = producer;
  return ::OK;
}

void OpenCVCameraCapture::closeCamera()
{
  ALOGE("OpenCVCameraCapture closeCamera");
  sPreviewProducer = NULL;
}
