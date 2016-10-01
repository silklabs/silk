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
#include <utils/Vector.h>
#include <utils/String16.h>

#include "IOpenCVCameraCapture.h"
#include "OpenCVCameraCapture.h"

#include "libpreview.h"


namespace libpreview {

using namespace android;

class ClientImpl;
class CaptureFrameGrabber: public ConsumerBase::FrameAvailableListener {
public:
  static sp<CaptureFrameGrabber> create();

  void registerClient(ClientImpl *client) {
    Mutex::Autolock autolock(mClientsMutex);
    mClients.push(client);
  }
  void unregisterClient(ClientImpl *client) {
    Mutex::Autolock autolock(mClientsMutex);
    for (size_t i = 0; i < mClients.size(); i++) {
      ClientImpl *c = mClients.itemAt(i);
      if (c == client) {
        mClients.removeAt(i);
        return;
      }
    }
  }

#ifdef CAF_CPUCONSUMER
  virtual void onFrameAvailable();
#else
  virtual void onFrameAvailable(const BufferItem& item);
#endif
  void onFrameAvailableUnlocked();
  void onFrameAvailableLocked();

private:
  Vector<ClientImpl*> mClients;
  mutable Mutex mClientsMutex; // Acquire before using mClients
  mutable Mutex mOnFrameAvailable; // Prevent multiple callers in onFrameAvailableLocked()

  CaptureFrameGrabber(sp<IOpenCVCameraCapture> capture);
  ~CaptureFrameGrabber();

  class LockedFrame: public RefBase {
  public:
    LockedFrame(void *frame, sp<CaptureFrameGrabber> grabber)
        : frame(frame), mGrabber(grabber) {}
    ~LockedFrame() {
      CpuConsumer::LockedBuffer img;
      img.data = static_cast<uint8_t*>(frame);

      status_t err = mGrabber->mCpuConsumer->unlockBuffer(img);
      if (err != 0) {
        ALOGE("Unable to unlock buffer, err=%d", err);
      }
      mGrabber->onFrameAvailableUnlocked();
    }
  private:
    void *frame;
    sp<CaptureFrameGrabber> mGrabber;
  };

  class DeathRecipient: public IBinder::DeathRecipient {
  public:
    DeathRecipient(CaptureFrameGrabber *grabber) : mGrabber(grabber) {}

    ~DeathRecipient() {
      mGrabber = NULL; // No delete/unref
    }

    virtual void binderDied(const wp<IBinder>& who __unused) {
      ALOGI("DeathRecipient::binderDied");
      mGrabber->binderDied();
    }
  private:
    CaptureFrameGrabber *mGrabber;
  };
  void binderDied();

  sp<CpuConsumer> mCpuConsumer;
  sp<IGraphicBufferProducer> mProducer;
  sp<IOpenCVCameraCapture> mCapture;
  sp<DeathRecipient> mDeathRecipient;
  static wp<CaptureFrameGrabber> sCaptureFrameGrabber;
};


class ClientImpl : public Client {
public:
  ClientImpl(FrameCallback frameCallback,
             AbandonedCallback abandonedCallback,
             void *userData,
             sp<CaptureFrameGrabber> grabber)
      : mFrameCallback(frameCallback),
        mAbandonedCallback(abandonedCallback),
        mUserData(userData),
        mGrabber(grabber) {
    mGrabber->registerClient(this);
  }

  ~ClientImpl() {
    mGrabber->unregisterClient(this);
    {
      Mutex::Autolock autolock(mFrameCallbackMutex);
      mFrameCallback = NULL;
      mAbandonedCallback = NULL;
    }
  }

  void releaseFrame(FrameOwner frameOwner) {
    if (frameOwner != NULL) {
      RefBase *ref = (RefBase *) frameOwner;
      ref->decStrong(NULL);
    }
  }

  void frameCallback(void *frame,
                     FrameFormat format,
                     size_t width,
                     size_t height,
                     FrameOwner owner) {
    Mutex::Autolock autolock(mFrameCallbackMutex);
    if (mFrameCallback != NULL) {
      mFrameCallback(mUserData, frame, format, width, height, owner);
    }
  }

  void abandoned() {
    Mutex::Autolock autolock(mFrameCallbackMutex);
    if (mAbandonedCallback != NULL) {
      mAbandonedCallback(mUserData);
      mAbandonedCallback = NULL;
    }
    mFrameCallback = NULL;
  }

private:
  mutable Mutex mFrameCallbackMutex; // Acquire before using mFrameCallback/mAbandonedCallback
  FrameCallback mFrameCallback;
  AbandonedCallback mAbandonedCallback;

  void *mUserData;
  sp<CaptureFrameGrabber> mGrabber;
};


sp<CaptureFrameGrabber> CaptureFrameGrabber::create()
{
  sp<ProcessState> ps = ProcessState::self();
  ps->startThreadPool();

  sp<CaptureFrameGrabber> grabber = sCaptureFrameGrabber.promote();
  if (grabber == NULL) {
    sp<IServiceManager> sm = defaultServiceManager();
    sp<IBinder> binder = sm->getService(
      String16(OpenCVCameraCapture::getServiceName()));
    if (binder == NULL) {
      ALOGE("Unable to connect with capture preview service");
      return NULL;
    }

    sp<IOpenCVCameraCapture> capture =
      interface_cast<IOpenCVCameraCapture>(binder);

    grabber = new CaptureFrameGrabber(capture);

    status_t err = capture->initCamera(0, grabber->mProducer);
    if (err != OK) {
      ALOGW("IOpenCVCameraCapture::init failed: %d", err);
      return NULL;
    }

    sCaptureFrameGrabber = grabber;
  }
  return grabber;
}


CaptureFrameGrabber::CaptureFrameGrabber(sp<IOpenCVCameraCapture> capture)
    : mCapture(capture)
{
  sp<IGraphicBufferConsumer> consumer;
  BufferQueue::createBufferQueue(&mProducer, &consumer);
  mCpuConsumer = new CpuConsumer(consumer, MAX_UNLOCKED_FRAMES + 1, true);
  mCpuConsumer->setName(String8("LibPreviewCpuConsumer"));
  mCpuConsumer->setFrameAvailableListener(this);

  mDeathRecipient = new DeathRecipient(this);
#ifdef TARGET_GE_MARSHMALLOW
  IInterface::asBinder(mCapture)->linkToDeath(mDeathRecipient);
#else
  mCapture->asBinder()->linkToDeath(mDeathRecipient);
#endif
}


CaptureFrameGrabber::~CaptureFrameGrabber() {
  binderDied();
#ifdef TARGET_GE_MARSHMALLOW
  IInterface::asBinder(mCapture)->unlinkToDeath(mDeathRecipient);
#else
  mCapture->asBinder()->unlinkToDeath(mDeathRecipient);
#endif
  mCapture->closeCamera();
}


void CaptureFrameGrabber::binderDied()
{
  ALOGV("CaptureFrameGrabber::binderDied");
  mCpuConsumer->abandon();

  {
    Mutex::Autolock autolock(mClientsMutex);
    for (size_t i = 0; i < mClients.size(); i++) {
      ClientImpl *client = mClients.itemAt(i);
      client->abandoned();
    }
    mClients.clear();
  }
}


#ifdef CAF_CPUCONSUMER
void CaptureFrameGrabber::onFrameAvailable()
#else
void CaptureFrameGrabber::onFrameAvailable(const BufferItem& item)
#endif
{
  ALOGV("CaptureFrameGrabber::onFrameAvailable");
  onFrameAvailableUnlocked();
}

void CaptureFrameGrabber::onFrameAvailableUnlocked()
{
  if (!mOnFrameAvailable.tryLock()) {
    onFrameAvailableLocked();
    mOnFrameAvailable.unlock();
  }
}

void CaptureFrameGrabber::onFrameAvailableLocked()
{
  ALOGV("CaptureFrameGrabber::onFrameAvailableLocked");
  Mutex::Autolock autolock(mClientsMutex);
  if (mClients.size() == 0) {
    ALOGW("No clients onFrameAvailable");
    return;
  }

  status_t err = 0;
  while (!err) {
    CpuConsumer::LockedBuffer img;
    err = mCpuConsumer->lockNextBuffer(&img);
    if (err) {
      if (err != BAD_VALUE) { // BAD_VALUE == No more buffers, not an error
        switch (err) {
        case NOT_ENOUGH_DATA:
          // Too many locked buffers, exit and wait for buffers to be returned
          ALOGV("CaptureFrameGrabber: NOT_ENOUGH_DATA");
          return;
        default:
          ALOGE("CaptureFrameGrabber: error %d from lockNextBuffer", err);
          break;
        }
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

    FrameFormat frameformat = FRAMEFORMAT_INVALID;
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

    RefBase *lockedFrame = new LockedFrame(img.data, this);
    lockedFrame->incStrong(NULL);
    for (size_t i = 0; i < mClients.size(); i++) {
      ClientImpl *client = mClients.itemAt(i);
      lockedFrame->incStrong(NULL);
      client->frameCallback(img.data,
                            frameformat,
                            img.width,
                            img.height,
                            (FrameOwner) lockedFrame);
    }
    lockedFrame->decStrong(NULL);
  }
}

wp<CaptureFrameGrabber> CaptureFrameGrabber::sCaptureFrameGrabber = NULL;

Client::~Client() {};
}

using namespace libpreview;
extern "C" Client *libpreview_open(FrameCallback frameCallback,
                                   AbandonedCallback abandonedCallback,
                                   void *userData) {
  sp<CaptureFrameGrabber> grabber = CaptureFrameGrabber::create();
  if (grabber == NULL) {
    return NULL;
  }
  return new ClientImpl(frameCallback,
                        abandonedCallback,
                        userData,
                        grabber);
}

// Ensure the signature of libpreview_open matches the type libpreview::OpenFunc
static OpenFunc staticTypeCheck = libpreview_open;
