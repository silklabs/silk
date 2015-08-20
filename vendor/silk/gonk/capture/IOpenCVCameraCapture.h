/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#ifndef IOPENCVCAMERACAPTURE_H
#define IOPENCVCAMERACAPTURE_H

#include <binder/IInterface.h>
#include <utils/RefBase.h>

namespace android {

class ICameraRecordingProxyListener;
class IMemory;
class Parcel;

class IOpenCVCameraCapture : public IInterface {
public:
  DECLARE_META_INTERFACE(OpenCVCameraCapture);

  virtual status_t initCamera(int cameraId,
    const sp<ICameraRecordingProxyListener>& frameListener) = 0;
  virtual void closeCamera() = 0;
  virtual double getProperty(int id) = 0;
  virtual void setProperty(int id, double value) = 0;
  virtual void applyProperties() = 0;

  // One day releaseFrame() should prove useful in resolving the TODO
  // in OpenCVCameraCapture::frameCallback() so keep it around...
  //virtual void releaseFrame(const sp<IMemory>& memory) = 0;
};

class BnOpenCVCameraCapture : public BnInterface<IOpenCVCameraCapture> {
public:
  virtual status_t onTransact(uint32_t code, const Parcel& data,
                              Parcel* reply, uint32_t flags = 0);
};

};

#endif
