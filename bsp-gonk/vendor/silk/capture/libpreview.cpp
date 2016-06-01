//#define LOG_NDEBUG 0
#define LOG_TAG "silk-libpreview"

#include <binder/IMemory.h>
#include <binder/IServiceManager.h>
#include <binder/ProcessState.h>
#include <camera/ICameraRecordingProxyListener.h>
#include <gui/CpuConsumer.h>
#include <media/openmax/OMX_IVCommon.h>
#include <system/camera.h>
#include <utils/Log.h>
#include <utils/String16.h>

#include "IOpenCVCameraCapture.h"
#include "OpenCVCameraCapture.h"

#include "libpreview.h"

using namespace android;

namespace {
using namespace libpreview;

class PreviewFrameGrabber: public ConsumerBase::FrameAvailableListener {
public:
  static bool open(FrameCallback frameCallback,
                   AbandonedCallback abandonedCallback,
                   void *userData);
  static void close();
  static void releaseFrame(void *frameBuffer);

  size_t framewidth;
  size_t frameheight;
  FrameFormat frameformat;

#ifdef CAF_CPUCONSUMER
  virtual void onFrameAvailable();
#else
  virtual void onFrameAvailable(const BufferItem& item);
#endif

private:
  PreviewFrameGrabber(FrameCallback frameCallback,
                      AbandonedCallback abandonedCallback,
                      void *userData,
                      sp<IOpenCVCameraCapture> capture);
  ~PreviewFrameGrabber();

  class DeathRecipient: public IBinder::DeathRecipient {
  public:
    DeathRecipient(PreviewFrameGrabber *pfg) : mPFG(pfg) {}

    ~DeathRecipient() {
      mPFG = NULL; // No delete/unref
    }

    virtual void binderDied(const wp<IBinder>& who __unused) {
      ALOGI("DeathRecipient::binderDied");
      mPFG->binderDied();
    }
  private:
    PreviewFrameGrabber *mPFG;
  };
  void binderDied();

  sp<CpuConsumer> mCpuConsumer;
  sp<IGraphicBufferProducer> mProducer;
  FrameCallback mFrameCallback;
  AbandonedCallback mAbandonedCallback;
  mutable Mutex mFrameCallbackMutex; // Acquire before using mFrameCallback/mAbandonedCallback
  void *mUserData;
  sp<IOpenCVCameraCapture> mCapture;
  sp<DeathRecipient> mDeathRecipient;
  static sp<PreviewFrameGrabber> sPreviewFrameGrabber;
};

bool PreviewFrameGrabber::open(FrameCallback frameCallback,
                               AbandonedCallback abandonedCallback,
                               void *userData)
{
  sp<ProcessState> ps = ProcessState::self();
  ps->startThreadPool();

  if (sPreviewFrameGrabber != NULL) {
    ALOGE("EUSERS");
    return false;
  }

  sp<IServiceManager> sm = defaultServiceManager();
  sp<IBinder> binder = sm->getService(
    String16(OpenCVCameraCapture::getServiceName()));
  if (binder == NULL) {
    ALOGE("Unable to connect with capture preview service");
    return false;
  }

  sp<IOpenCVCameraCapture> capture =
    interface_cast<IOpenCVCameraCapture>(binder);

  sp<PreviewFrameGrabber> pfg = new PreviewFrameGrabber(
    frameCallback,
    abandonedCallback,
    userData,
    capture
  );

  status_t err = capture->initCamera(0, pfg->mProducer);
  if (err != OK) {
    ALOGW("IOpenCVCameraCapture::init failed: %d", err);
    return false;
  }

  sPreviewFrameGrabber = pfg;
  return true;
}

void PreviewFrameGrabber::close()
{
  if (sPreviewFrameGrabber != NULL) {
    {
      Mutex::Autolock autolock(sPreviewFrameGrabber->mFrameCallbackMutex);
      sPreviewFrameGrabber->mFrameCallback = NULL;
      sPreviewFrameGrabber->mAbandonedCallback = NULL;
    }
    sPreviewFrameGrabber = NULL;
  }
}

void PreviewFrameGrabber::releaseFrame(void *frameBuffer) {
  if (sPreviewFrameGrabber == NULL) {
    ALOGE("ENODEV");
    return;
  }

  CpuConsumer::LockedBuffer img;
  img.data = static_cast<uint8_t*>(frameBuffer);

  status_t err = sPreviewFrameGrabber->mCpuConsumer->unlockBuffer(img);
  if (err != 0) {
    ALOGE("Unable to unlock buffer, err=%d", err);
  }
}


PreviewFrameGrabber::PreviewFrameGrabber(FrameCallback frameCallback,
                                         AbandonedCallback abandonedCallback,
                                         void *userData,
                                         sp<IOpenCVCameraCapture> capture)
    : mFrameCallback(frameCallback),
      mAbandonedCallback(abandonedCallback),
      mUserData(userData),
      mCapture(capture)
{
  frameformat = FRAMEFORMAT_INVALID;

  sp<IGraphicBufferConsumer> consumer;
  BufferQueue::createBufferQueue(&mProducer, &consumer);
  mCpuConsumer = new CpuConsumer(consumer, MAX_UNLOCKED_FRAMEBUFFERS + 1, true);
  mCpuConsumer->setName(String8("OpenCVCpuConsumer"));
  mCpuConsumer->setFrameAvailableListener(this);

  mDeathRecipient = new DeathRecipient(this);
#ifdef TARGET_GE_MARSHMALLOW
  IInterface::asBinder(mCapture)->linkToDeath(mDeathRecipient);
#else
  mCapture->asBinder()->linkToDeath(mDeathRecipient);
#endif
}

PreviewFrameGrabber::~PreviewFrameGrabber() {
  binderDied();
#ifdef TARGET_GE_MARSHMALLOW
  IInterface::asBinder(mCapture)->unlinkToDeath(mDeathRecipient);
#else
  mCapture->asBinder()->unlinkToDeath(mDeathRecipient);
#endif
  mCapture->closeCamera();
}

void PreviewFrameGrabber::binderDied()
{
  ALOGV("PreviewFrameGrabber::binderDied");
  mCpuConsumer->abandon();
  {
    Mutex::Autolock autolock(mFrameCallbackMutex);
    if (mAbandonedCallback != NULL) {
      mAbandonedCallback(mUserData);
      mAbandonedCallback = NULL;
    }
    mFrameCallback = NULL;
  }
}

#ifdef CAF_CPUCONSUMER
void PreviewFrameGrabber::onFrameAvailable()
#else
void PreviewFrameGrabber::onFrameAvailable(const BufferItem& item)
#endif
{
  ALOGV("PreviewFrameGrabber::onFrameAvailable");
  Mutex::Autolock autolock(mFrameCallbackMutex);
  if (mFrameCallback == NULL) {
    return;
  }

  status_t err = 0;
  while (!err) {
    CpuConsumer::LockedBuffer img;
    err = mCpuConsumer->lockNextBuffer(&img);
    if (err) {
      if (err != BAD_VALUE) { // BAD_VALUE == No more buffers, not an error
        ALOGE("PreviewFrameGrabber: error %d from lockNextBuffer", err);
      }
      continue;
    }

#ifdef CAF_CPUCONSUMER
    ALOGV("Frame: data=%p %ux%u  fmt=%x",
      img.data, img.width, img.height, img.format);
#else
    ALOGV("Frame: data=%p %ux%u  fmt=%x flexfmt=%x",
      img.data, img.width, img.height, img.format, img.flexFormat);
#endif
    ALOGV("Frame: xform=%d stride=%x dataCb=%p dataCr=%p",
      img.transform, img.stride, img.dataCb, img.dataCr);
    ALOGV("Frame: scalingMode=%d, chromaStride=%d chromaStep=%d",
      img.scalingMode, img.chromaStride, img.chromaStep);
    ALOGV("Frame: frameNumber=%lld, timestamp=%lld",
      img.frameNumber, img.timestamp);

    if (frameformat == FRAMEFORMAT_INVALID) {
      framewidth = img.width;
      frameheight = img.height;

      //
      // Note that OpenCV currently only supports yvu420sp/yuv420sp...
      //
      switch (img.format) {
      case HAL_PIXEL_FORMAT_RGBA_8888: // QEmu
        frameformat = FRAMEFORMAT_RGB;
        break;

      case HAL_PIXEL_FORMAT_YCrCb_420_SP: // Nexus 4
        frameformat = FRAMEFORMAT_YVU420SP;
        break;

#ifndef CAF_CPUCONSUMER // "flexFormat" is in AOSP but not CAF
      case HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED: // Nexus 5
        if (img.flexFormat == HAL_PIXEL_FORMAT_YCbCr_420_888) {
          frameformat = FRAMEFORMAT_YVU420SP;
          break;
        }
#endif
        //fall through
      default:
        ALOGW("Unsupported preview format: 0x%x", img.format);
        break;
      }
    }

    mFrameCallback(mUserData, img.data, frameformat, framewidth, frameheight);
  }
}

sp<PreviewFrameGrabber> PreviewFrameGrabber::sPreviewFrameGrabber = NULL;

}

extern "C" {

vtable vtable = {
  .open = PreviewFrameGrabber::open,
  .close = PreviewFrameGrabber::close,
  .releaseFrame = PreviewFrameGrabber::releaseFrame,
};

}
