/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "IOpenCVCameraCapture"

#include <binder/IMemory.h>
#include <binder/Parcel.h>
#include <camera/ICameraRecordingProxyListener.h>
#include <stdint.h>
#include <utils/Log.h>

#include "IOpenCVCameraCapture.h"

namespace android {

enum {
  INIT_CAMERA = IBinder::FIRST_CALL_TRANSACTION,
  CLOSE_CAMERA,
  //RELEASE_FRAME,
  GET_PROPERTY,
  SET_PROPERTY,
  APPLY_PROPERTIES,
};


class BpOpenCVCameraCapture: public BpInterface<IOpenCVCameraCapture> {
public:
  BpOpenCVCameraCapture(const sp<IBinder>& impl)
    : BpInterface<IOpenCVCameraCapture>(impl)
  {
  }

  status_t initCamera(int cameraId,
    const sp<ICameraRecordingProxyListener>& frameListener)
  {
    ALOGV("initCamera");
    Parcel data, reply;
    data.writeInterfaceToken(IOpenCVCameraCapture::getInterfaceDescriptor());
    data.writeInt32(cameraId);
    data.writeStrongBinder(frameListener->asBinder());
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

#if 0
  void releaseFrame(const sp<IMemory>& memory)
  {
    ALOGV("releaseFrame");
    Parcel data, reply;
    data.writeInterfaceToken(IOpenCVCameraCapture::getInterfaceDescriptor());
    data.writeStrongBinder(memory->asBinder());
    remote()->transact(RELEASE_FRAME, data, &reply);
  }
#endif

  double getProperty(int id)
  {
    ALOGV("getProperty");
    Parcel data, reply;
    data.writeInterfaceToken(IOpenCVCameraCapture::getInterfaceDescriptor());
    data.writeInt32(id);
    remote()->transact(GET_PROPERTY, data, &reply);
    return reply.readDouble();
  }

  void setProperty(int id, double value)
  {
    ALOGV("setProperty");
    Parcel data, reply;
    data.writeInterfaceToken(IOpenCVCameraCapture::getInterfaceDescriptor());
    data.writeInt32(id);
    data.writeDouble(value);
    remote()->transact(SET_PROPERTY, data, &reply);
  }

  void applyProperties()
  {
    ALOGV("applyProperties");
    Parcel data, reply;
    data.writeInterfaceToken(IOpenCVCameraCapture::getInterfaceDescriptor());
    remote()->transact(APPLY_PROPERTIES, data, &reply);
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
    sp<ICameraRecordingProxyListener> listener =
        interface_cast<ICameraRecordingProxyListener>(data.readStrongBinder());
    reply->writeInt32(initCamera(cameraId, listener));
    return NO_ERROR;
  }
  case CLOSE_CAMERA:
  {
    ALOGV("CLOSE_CAMERA");
    CHECK_INTERFACE(IOpenCVCameraCapture, data, reply);
    closeCamera();
    return NO_ERROR;
  }
#if 0
  case RELEASE_FRAME:
  {
    ALOGV("RELEASE_FRAME");
    CHECK_INTERFACE(IOpenCVCameraCapture, data, reply);
    sp<IMemory> memory = interface_cast<IMemory>(data.readStrongBinder());
    releaseFrame(memory);
    return NO_ERROR;
  }
#endif
  case GET_PROPERTY:
  {
    ALOGV("GET_PROPERTY");
    CHECK_INTERFACE(IOpenCVCameraCapture, data, reply);
    int id = data.readInt32();
    reply->writeDouble(getProperty(id));
    return NO_ERROR;
  }
  case SET_PROPERTY:
  {
    ALOGV("SET_PROPERTY");
    CHECK_INTERFACE(IOpenCVCameraCapture, data, reply);
    int id = data.readInt32();
    double value = data.readDouble();
    setProperty(id, value);
    return NO_ERROR;
  }
  case APPLY_PROPERTIES:
  {
    ALOGV("APPLY_PROPERTIES");
    CHECK_INTERFACE(IOpenCVCameraCapture, data, reply);
    applyProperties();
    return NO_ERROR;
  }

  default:
    return BBinder::onTransact(code, data, reply, flags);
  }
}

};
