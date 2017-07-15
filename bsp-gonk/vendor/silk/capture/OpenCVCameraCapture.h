#ifndef OPENCVCAMERACAPTURE_H
#define OPENCVCAMERACAPTURE_H

#include <log/log.h>

#include <binder/ProcessState.h>
#include <binder/BinderService.h>
#include <gui/IGraphicBufferProducer.h>

#include "IOpenCVCameraCapture.h"

using namespace android;

class OpenCVCameraCapture : public BinderService<OpenCVCameraCapture>,
                            public BnOpenCVCameraCapture,
                            public IBinder::DeathRecipient {
public:
  static const char *getServiceName() { return "libnative_camera_capture"; }

  class PreviewProducerListener : public RefBase {
  public:
    virtual void onPreviewProducer() = 0; // May be called on any thread
  };

  OpenCVCameraCapture();
  virtual ~OpenCVCameraCapture();
  status_t publish();

  void setPreviewProducerListener(sp<PreviewProducerListener> listener) {
    mPreviewProducerListener = listener;
  }
  sp<IGraphicBufferProducer> getPreviewProducer();

  // IOpenCVCameraCapture methods
  virtual status_t initCamera(int cameraId,
    const sp<IGraphicBufferProducer>& producer);
  virtual void closeCamera();

  virtual void binderDied(const wp<IBinder> &who);
private:
  void setPreviewProducer(const sp<IGraphicBufferProducer>& producer);

  sp<IGraphicBufferProducer> mPreviewProducer;
  sp<PreviewProducerListener> mPreviewProducerListener;
  Mutex mLock;
};
#endif
