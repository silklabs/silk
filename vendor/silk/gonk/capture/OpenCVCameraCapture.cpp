/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "OpenCVCameraCapture"

#include <binder/BinderService.h>
#include <binder/ProcessState.h>
#include <binder/IServiceManager.h>
#include <system/camera.h>
#include <utils/Log.h>

#include "Capturedefs.h"
#include "OpenCVCameraCapture.h"

using namespace android;

OpenCVCameraCapture::OpenCVCameraCapture() : BnOpenCVCameraCapture()
{
}

OpenCVCameraCapture::~OpenCVCameraCapture()
{
  closeCamera();
}

status_t OpenCVCameraCapture::publish()
{
  sp<IServiceManager> sm(defaultServiceManager());
  return sm->addService(String16(getServiceName()), this, false);
}

sp<IGraphicBufferProducer> OpenCVCameraCapture::getPreviewProducer()
{
  return mPreviewProducer;
}

status_t OpenCVCameraCapture::initCamera(int cameraId, const sp<IGraphicBufferProducer>& producer)
{
  ALOGV("OpenCVCameraCapture initCamera");
  if (cameraId != 0) {
    return BAD_VALUE;
  }

  setPreviewProducer(producer);
  return ::OK;
}

void OpenCVCameraCapture::closeCamera()
{
  ALOGV("OpenCVCameraCapture closeCamera");
  setPreviewProducer(NULL);
}

void OpenCVCameraCapture::binderDied(const wp<IBinder> &who)
{
  setPreviewProducer(NULL);
}

void OpenCVCameraCapture::setPreviewProducer(const sp<IGraphicBufferProducer>& producer)
{
  Mutex::Autolock autoLock(mLock);

  if (mPreviewProducer != NULL) {
    sp<IBinder> binder = mPreviewProducer->asBinder();
    binder->unlinkToDeath(this);
    mPreviewProducer = NULL;
  }
  if (producer != NULL) {
    mPreviewProducer = producer;
    sp<IBinder> binder = mPreviewProducer->asBinder();
    binder->linkToDeath(this);
  }

  if (mPreviewProducerListener != NULL) {
    mPreviewProducerListener->onPreviewProducer();
  }
}

