/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#ifndef OPENCVCAMERACAPTURE_H
#define OPENCVCAMERACAPTURE_H

#include <utils/Log.h>

#include <binder/ProcessState.h>
#include <binder/BinderService.h>
#include <camera/ICameraRecordingProxy.h>

#include "IOpenCVCameraCapture.h"

namespace android {

class OpenCVCameraCapture : public BinderService<OpenCVCameraCapture>,
                            public BnOpenCVCameraCapture,
                            public IBinder::DeathRecipient {
public:
  static status_t publish();
  static void frameCallback(nsecs_t timestamp, const sp<IMemory>& data);
  static const char *getServiceName() { return "libnative_camera_capture"; }

  OpenCVCameraCapture();
  virtual ~OpenCVCameraCapture();

  virtual status_t initCamera(int cameraId, const sp<ICameraRecordingProxyListener>& listener);
  virtual void closeCamera();
  virtual double getProperty(int id);
  virtual void setProperty(int id, double value);
  virtual void applyProperties();

  virtual void binderDied(const wp<IBinder> &who) {
    appListener = NULL;
  }

private:
  static sp<ICameraRecordingProxyListener> appListener;
  void setListener(const sp<ICameraRecordingProxyListener>& listener);
};

};

#endif
