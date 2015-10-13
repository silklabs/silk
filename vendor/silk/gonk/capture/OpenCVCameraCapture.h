/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#ifndef OPENCVCAMERACAPTURE_H
#define OPENCVCAMERACAPTURE_H

#include <utils/Log.h>

#include <binder/ProcessState.h>
#include <binder/BinderService.h>

#include "IOpenCVCameraCapture.h"

namespace android {

class OpenCVCameraCapture : public BinderService<OpenCVCameraCapture>,
                            public BnOpenCVCameraCapture
{
public:
  static status_t publish();
  static void frameCallback(nsecs_t timestamp, const sp<IMemory>& data);
  static const char *getServiceName() { return "libnative_camera_capture"; }

  OpenCVCameraCapture();
  virtual ~OpenCVCameraCapture();

  virtual status_t initCamera(int cameraId,
    const sp<IGraphicBufferProducer>& producer);
  virtual void closeCamera();

private:
};

};

#endif
