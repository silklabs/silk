#ifndef IOPENCVCAMERACAPTURE_H
#define IOPENCVCAMERACAPTURE_H

#include <binder/IInterface.h>
#include <utils/RefBase.h>

namespace android {

class IGraphicBufferProducer;
class IMemory;
class Parcel;

class IOpenCVCameraCapture : public IInterface {
public:
  DECLARE_META_INTERFACE(OpenCVCameraCapture);

  virtual status_t initCamera(int cameraId,
    const sp<IGraphicBufferProducer>& producer) = 0;
  virtual void closeCamera() = 0;
};

class BnOpenCVCameraCapture : public BnInterface<IOpenCVCameraCapture> {
public:
  virtual status_t onTransact(uint32_t code, const Parcel& data,
                              Parcel* reply, uint32_t flags = 0);
};

};

#endif
