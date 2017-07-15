//#define LOG_NDEBUG 0
#define LOG_TAG "OpenCVCameraCapture"

#include <binder/BinderService.h>
#include <binder/ProcessState.h>
#include <binder/IServiceManager.h>
#include <system/camera.h>
#include <log/log.h>


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
  return OK;
}

void OpenCVCameraCapture::closeCamera()
{
  ALOGV("OpenCVCameraCapture closeCamera");
  setPreviewProducer(NULL);
}

void OpenCVCameraCapture::binderDied(const wp<IBinder> &who)
{
  (void) who;
#if 1
  //
  // The camera HAL, on Nexus 4/5 at least, will get jammed up if the preview
  // surface disappears while the recording pipeline continues.  This is likely
  // a bug in the camera HAL where it doesn't properly listen to binder death
  // receipts like we do here!  The preview continues however the CameraSource
  // stops emitting video buffers with this re-occurring logcat message:
  //
  //    CameraSource: Timed out waiting for incoming camera video frames
  //
  // At the moment while the main node process restarts video data is lost
  // anyway and |capture| will certainly come up before |node|, so there's not
  // much downside to quickly restarting ourselves here as well in an attempt to
  // reset the camera HAL back to a good state.
  ALOGE("OpenCVCameraCapture::binderDied - goodbye cruel world");
  exit(0); // Assume we're running as a service and |init| will restart us.
#else
  // Client disappeared on us!  Remove its producer from the camera pipeline.
  setPreviewProducer(NULL);
#endif
}

void OpenCVCameraCapture::setPreviewProducer(const sp<IGraphicBufferProducer>& producer)
{
  Mutex::Autolock autoLock(mLock);

  if (mPreviewProducer != NULL) {
#ifdef TARGET_GE_MARSHMALLOW
    sp<IBinder> binder = IInterface::asBinder(mPreviewProducer);
#else
    sp<IBinder> binder = mPreviewProducer->asBinder();
#endif
    binder->unlinkToDeath(this);
    mPreviewProducer = NULL;
  }
  if (producer != NULL) {
    mPreviewProducer = producer;
#ifdef TARGET_GE_MARSHMALLOW
    sp<IBinder> binder = IInterface::asBinder(mPreviewProducer);
#else
    sp<IBinder> binder = mPreviewProducer->asBinder();
#endif
    binder->linkToDeath(this);
  }

  if (mPreviewProducerListener != NULL) {
    mPreviewProducerListener->onPreviewProducer();
  }
}

