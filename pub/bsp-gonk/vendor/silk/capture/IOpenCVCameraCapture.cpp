//#define LOG_NDEBUG 0
#define LOG_TAG "IOpenCVCameraCapture"

#include <binder/IMemory.h>
#include <binder/Parcel.h>
#include <gui/IGraphicBufferProducer.h>
#include <stdint.h>
#include <utils/Log.h>

#include "IOpenCVCameraCapture.h"

namespace android {

enum {
  INIT_CAMERA = IBinder::FIRST_CALL_TRANSACTION,
  CLOSE_CAMERA
};


class BpOpenCVCameraCapture: public BpInterface<IOpenCVCameraCapture> {
public:
  BpOpenCVCameraCapture(const sp<IBinder>& impl)
    : BpInterface<IOpenCVCameraCapture>(impl)
  {
  }

  status_t initCamera(int cameraId,
    const sp<IGraphicBufferProducer>& producer)
  {
    ALOGV("initCamera");
    Parcel data, reply;
    data.writeInterfaceToken(IOpenCVCameraCapture::getInterfaceDescriptor());
    data.writeInt32(cameraId);
#ifdef TARGET_GE_MARSHMALLOW
    data.writeStrongBinder(IInterface::asBinder(producer));
#else
    data.writeStrongBinder(producer->asBinder());
#endif
    remote()->transact(INIT_CAMERA, data, &reply);
    return reply.readInt32();
  }

  void closeCamera()
  {
    ALOGV("closeCamera");
    Parcel data, reply;
    data.writeInterfaceToken(IOpenCVCameraCapture::getInterfaceDescriptor());
    remote()->transact(CLOSE_CAMERA, data, &reply);
  }
};

IMPLEMENT_META_INTERFACE(OpenCVCameraCapture, "silk.capture.IOpenCVCameraCapture");

// ----------------------------------------------------------------------

status_t BnOpenCVCameraCapture::onTransact(uint32_t code, const Parcel& data,
                                           Parcel* reply, uint32_t flags)
{
  switch(code) {
  case INIT_CAMERA:
  {
    ALOGV("INIT_CAMERA");
    CHECK_INTERFACE(IOpenCVCameraCapture, data, reply);
    int cameraId = data.readInt32();
    sp<IGraphicBufferProducer> producer =
        interface_cast<IGraphicBufferProducer>(data.readStrongBinder());
    reply->writeInt32(initCamera(cameraId, producer));
    return NO_ERROR;
  }
  case CLOSE_CAMERA:
  {
    ALOGV("CLOSE_CAMERA");
    CHECK_INTERFACE(IOpenCVCameraCapture, data, reply);
    closeCamera();
    return NO_ERROR;
  }
  default:
    return BBinder::onTransact(code, data, reply, flags);
  }
}

};
