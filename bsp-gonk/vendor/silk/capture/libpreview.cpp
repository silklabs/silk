//#define LOG_NDEBUG 0
#define LOG_TAG "silk-libpreview"

#include <binder/IMemory.h>
#include <binder/IServiceManager.h>
#include <binder/ProcessState.h>
#include <camera/ICameraRecordingProxyListener.h>
#include <gui/CpuConsumer.h>
#include <media/openmax/OMX_IVCommon.h>
#include <system/camera.h>
#include <cutils/atomic.h>
#include <cutils/properties.h>
#include <log/log.h>
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

  size_t width;
  size_t height;

#ifdef CAF_CPUCONSUMER
  virtual void onFrameAvailable();
#else
  virtual void onFrameAvailable(const BufferItem& item);
#endif
 private:
  Vector<ClientImpl*> mClients;
  mutable Mutex mClientsMutex; // Acquire before using mClients

  // Acquire before locking or unlocking a CpuConsumer buffer
  mutable Mutex mBufferLockOrUnlockMutex;

  // Condition to wait for an unlocked CpuConsumer buffer
  mutable Condition mBufferUnlockCondition;

  CaptureFrameGrabber(sp<IOpenCVCameraCapture> capture);
  ~CaptureFrameGrabber();

  class LockedFrame: public RefBase {
   public:
    LockedFrame(void *frame, sp<CaptureFrameGrabber> grabber)
        : frame(frame), mGrabber(grabber) {}
    ~LockedFrame() {
      Mutex::Autolock autolock(mGrabber->mBufferLockOrUnlockMutex);
      CpuConsumer::LockedBuffer img;
      img.data = static_cast<uint8_t*>(frame);

      status_t err = mGrabber->mCpuConsumer->unlockBuffer(img);
      if (err != 0) {
        ALOGE("Unable to unlock buffer, err=%d", err);
      }
      mGrabber->mBufferUnlockCondition.signal();
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
  bool mDead;
  // Acquire before using sCaptureFrameGrabber or mDead
  static Mutex sCaptureFrameGrabberMutex;
};


class ClientImpl : public Client {
 public:
  ClientImpl(FrameCallback frameCallback,
             AbandonedCallback abandonedCallback,
             void *userData,
             sp<CaptureFrameGrabber> grabber)
      : mCount(1),
        mFrameCallback(frameCallback),
        mAbandonedCallback(abandonedCallback),
        mUserData(userData),
        mGrabber(grabber) {
    mGrabber->registerClient(this);
  }

  void addref() {
    android_atomic_inc(&mCount);
  }

  void release() {
    if (android_atomic_dec(&mCount) == 1) {
      delete this;
    }
  }

  void getSize(size_t &width, size_t &height) {
    width = mGrabber->width;
    height = mGrabber->height;
  }

  void releaseFrame(FrameOwner frameOwner) {
    if (frameOwner != NULL) {
      RefBase *ref = (RefBase *) frameOwner;
      ref->decStrong(NULL);
    }
  }

  void stopFrameCallback() {
    Mutex::Autolock autolock(mFrameCallbackMutex);
    mFrameCallback = NULL;
    mAbandonedCallback = NULL;
  }

  void frameCallback(void *buffer,
                     FrameFormat format,
                     size_t width,
                     size_t height,
                     FrameOwner owner) {
    Mutex::Autolock autolock(mFrameCallbackMutex);
    if (mFrameCallback != NULL) {
      Frame frame = {
        .userData = mUserData,
        .frame = buffer,
        .format = format,
        .width = width,
        .height = height,
        .owner = owner,
      };
      mFrameCallback(frame);
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
 protected:
  ~ClientImpl() {
    mGrabber->unregisterClient(this);
    {
      Mutex::Autolock autolock(mFrameCallbackMutex);
      mFrameCallback = NULL;
      mAbandonedCallback = NULL;
    }
  }

 private:
  mutable volatile int32_t mCount;
  mutable Mutex mFrameCallbackMutex; // Acquire before using mFrameCallback/mAbandonedCallback
  FrameCallback mFrameCallback;
  AbandonedCallback mAbandonedCallback;

  void *mUserData;
  sp<CaptureFrameGrabber> mGrabber;
};


sp<CaptureFrameGrabber> CaptureFrameGrabber::create()
{
  Mutex::Autolock autolock(sCaptureFrameGrabberMutex);

  sp<ProcessState> ps = ProcessState::self();
  ps->startThreadPool();

  sp<CaptureFrameGrabber> grabber = sCaptureFrameGrabber.promote();
  if (grabber == NULL) {
    ALOGI("creating new CaptureFrameGrabber");
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
  } else {
    ALOGI("Reusing existing CaptureFrameGrabber");
  }
  return grabber;
}


CaptureFrameGrabber::CaptureFrameGrabber(sp<IOpenCVCameraCapture> capture)
    : mCapture(capture)
{
  width = 1280;
  height = 720;

  char resolution[PROPERTY_VALUE_MAX];
  resolution[0] = '\0';
  if (property_get("persist.silk.camera.resolution", resolution, nullptr) <= 0) {
    property_get("ro.silk.camera.resolution", resolution, nullptr);
  }

  for (char* x = resolution; *x; x++) {
    if (*x == 'x') {
      width = strtol(resolution, nullptr, 10);
      height = strtol(x + 1, nullptr, 10);
      break;
    }
  }

  ALOGI("CaptureFrameGrabber initializing at %dx%d", width, height);

  sp<IGraphicBufferConsumer> consumer;
  BufferQueue::createBufferQueue(&mProducer, &consumer);
  consumer->setDefaultBufferSize(width, height);
  consumer->setDefaultBufferFormat(HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED);

  mDead = false; // aleady holding sCaptureFrameGrabberMutex in ::create()
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
  ALOGV("~CaptureFrameGrabber");

#ifdef TARGET_GE_MARSHMALLOW
  IInterface::asBinder(mCapture)->unlinkToDeath(mDeathRecipient);
#else
  mCapture->asBinder()->unlinkToDeath(mDeathRecipient);
#endif
  {
    Mutex::Autolock autolock(mClientsMutex);
    if (!mDead) {
      mCapture->closeCamera();
    }
  }
  binderDied();
}


void CaptureFrameGrabber::binderDied()
{
  ALOGV("CaptureFrameGrabber::binderDied");
  mCpuConsumer->abandon();

  bool dead;
  {
    Mutex::Autolock autolock(mClientsMutex);
    dead = mDead;
    mDead = true;
  }

  if (!dead) {
    Mutex::Autolock autolock(sCaptureFrameGrabberMutex);
    sCaptureFrameGrabber = nullptr;
  }

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
#ifndef CAF_CPUCONSUMER
  (void) item;
#endif
  status_t err = 0;
  while (!err) {
    CpuConsumer::LockedBuffer img;

    {
      Mutex::Autolock autolock(mBufferLockOrUnlockMutex);
      err = mCpuConsumer->lockNextBuffer(&img);
      if (err) {
        switch (err) {
        case NOT_ENOUGH_DATA:
          mBufferUnlockCondition.wait(mBufferLockOrUnlockMutex);
          err = 0; // A buffer was unlocked so let's try again
          break;
        case BAD_VALUE:
          // No more buffers, not an error
          break;
        default:
          ALOGE("CaptureFrameGrabber: error %d from lockNextBuffer", err);
          break;
        }
        continue;
      }
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

    case HAL_PIXEL_FORMAT_YCbCr_420_888:
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

    if (img.width != width || img.height != height) {
      ALOGW("Unexpected frame size: expecting=%dx%d, got=%dx%d",
        width, height, img.width, img.height);
    }

    if (img.width != img.stride) {
      ALOGW("Width (%d) != stride (%d) not supported", img.width, img.stride);
    }

    if (frameformat == FRAMEFORMAT_YVU420SP) {
      void *packedDataCr = (char *)(img.data) + img.width * img.height;
      if (packedDataCr != img.dataCr) {
        void *venusDataCr = (char *)(img.data) + VENUS_C_PLANE_OFFSET(img.width, img.height);
        if (venusDataCr == img.dataCr) {
          frameformat = FRAMEFORMAT_YVU420SP_VENUS;
        } else {
          // TODO: Some other YVU variant.  Update consumers to handle unpacked
          //       YVU frames, maybe by adding a new frameFormat type.
          //       For now just move the VU plane (yuck) to avoid full buffer
          //       copy.
          ALOGV("YVU frame is not packed! Off by %d bytes", (int) packedDataCr - (int) img.dataCr);
          memcpy(packedDataCr, img.dataCr, img.width * img.height / 2);
        }
      }
    }

    RefBase *lockedFrame = new LockedFrame(img.data, this);
    lockedFrame->incStrong(NULL);
    {
      Mutex::Autolock autolock(mClientsMutex);
      for (size_t i = 0; i < mClients.size(); i++) {
        ClientImpl *client = mClients.itemAt(i);
        lockedFrame->incStrong(NULL);
        client->frameCallback(img.data,
                              frameformat,
                              img.width,
                              img.height,
                              (FrameOwner) lockedFrame);
      }
    }
    lockedFrame->decStrong(NULL);
  }
}

wp<CaptureFrameGrabber> CaptureFrameGrabber::sCaptureFrameGrabber = NULL;
Mutex CaptureFrameGrabber::sCaptureFrameGrabberMutex;

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
