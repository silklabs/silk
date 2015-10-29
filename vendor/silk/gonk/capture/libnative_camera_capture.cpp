/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "libnative_camera_capture"

#include <binder/IMemory.h>
#include <binder/IServiceManager.h>
#include <binder/ProcessState.h>
#include <camera/ICameraRecordingProxyListener.h>
#include <external/opencv2/modules/androidcamera/camera_wrapper/camera_wrapper.h>
#include <external/opencv2/modules/androidcamera/include/camera_properties.h>
#include <gui/CpuConsumer.h>
#include <media/openmax/OMX_IVCommon.h>
#include <system/camera.h>
#include <utils/Log.h>
#include <utils/String16.h>

#include "IOpenCVCameraCapture.h"
#include "OpenCVCameraCapture.h"

using namespace android;


class PreviewFrameGrabber: public ConsumerBase::FrameAvailableListener {
public:
  static sp<PreviewFrameGrabber> create(int cameraId,
    CameraCallback cameraCallback, void *userData);

  ~PreviewFrameGrabber();

  void requestFrame() {
    mGrabFrame = true;
  }

  size_t framewidth;
  size_t frameheight;
  char const *frameformat;

#ifdef CAF_CPUCONSUMER
  virtual void onFrameAvailable();
#else
  virtual void onFrameAvailable(const BufferItem& item);
#endif

private:
  PreviewFrameGrabber(CameraCallback cameraCallback, void *userData,
    sp<IOpenCVCameraCapture> capture);

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
  CameraCallback mCameraCallback;
  void *mUserData;
  sp<IOpenCVCameraCapture> mCapture;
  bool mGrabFrame;
  sp<DeathRecipient> mDeathRecipient;
};

sp<PreviewFrameGrabber> PreviewFrameGrabber::create(int cameraId,
  CameraCallback cameraCallback, void *userData)
{
  sp<IServiceManager> sm = defaultServiceManager();
  sp<IBinder> binder = sm->getService(
    String16(OpenCVCameraCapture::getServiceName()));
  if (binder == NULL) {
    ALOGE("Unable to connect with capture preview service");
    return NULL;
  }

  sp<IOpenCVCameraCapture> capture =
    interface_cast<IOpenCVCameraCapture>(binder);

  sp<PreviewFrameGrabber> pfg = new PreviewFrameGrabber(
    (CameraCallback) cameraCallback, userData, capture);

  status_t err = capture->initCamera(cameraId, pfg->mProducer);
  if (err != OK) {
    ALOGW("IOpenCVCameraCapture::init failed: %d", err);
    return NULL;
  }

  return pfg;
}


PreviewFrameGrabber::PreviewFrameGrabber(CameraCallback cameraCallback,
  void *userData, sp<IOpenCVCameraCapture> capture)
    : mCameraCallback(cameraCallback), mUserData(userData), mCapture(capture)
{
  frameformat = NULL;

  // Always grab the first frame to obtain the frame width/height/format
  mGrabFrame = true;

  sp<IGraphicBufferConsumer> consumer;
  BufferQueue::createBufferQueue(&mProducer, &consumer);
  mCpuConsumer = new CpuConsumer(consumer, 1, true);
  mCpuConsumer->setName(String8("OpenCVCpuConsumer"));
  mCpuConsumer->setFrameAvailableListener(this);

  mDeathRecipient = new DeathRecipient(this);
  mCapture->asBinder()->linkToDeath(mDeathRecipient);
}

PreviewFrameGrabber::~PreviewFrameGrabber() {
  binderDied();
  mCapture->asBinder()->unlinkToDeath(mDeathRecipient);
  mCapture->closeCamera();
}

void PreviewFrameGrabber::binderDied()
{
  ALOGV("PreviewFrameGrabber::binderDied");
  mCpuConsumer->abandon();
}

#ifdef CAF_CPUCONSUMER
void PreviewFrameGrabber::onFrameAvailable()
#else
void PreviewFrameGrabber::onFrameAvailable(const BufferItem& item)
#endif
{
  ALOGV("PreviewFrameGrabber::onFrameAvailable");
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

    if (!mGrabFrame) {
      // TODO: Don't bother mapping the buffer via CpuConsumer when a frame
      // is not requested.
      err = mCpuConsumer->unlockBuffer(img);
      if (err) {
        ALOGE("PreviewFrameGrabber: unlockBuffer error: %d", err);
      }
      continue;
    }

    mGrabFrame = false;

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

    if (frameformat == NULL) {
      framewidth = img.width;
      frameheight = img.height;

      //
      // Note that OpenCV currently only supports yvu420sp/yuv420sp...
      //
      switch (img.format) {
      case HAL_PIXEL_FORMAT_RGBA_8888: // QEmu
        // TODO: Either fix the emulator to return yuv420sp/yvu420sp, perform a
        // RGB to YUV conversion here, or fix OpenCV to understand RGB frames.
        // In the meantime this little hack enables at least some data to flow
        // through the OpenCV camera subsystem in the emulator, which is better
        // than nothing.
        //hack.str = "rgba8888";
        ALOGW("QEmu hack: pretending rgba8888 frame is yuv420sp...");
        frameformat = "yuv420sp";
        break;

      case HAL_PIXEL_FORMAT_YCrCb_420_SP: // Nexus 4
        frameformat = "yvu420sp";
        break;

#ifndef CAF_CPUCONSUMER // "flexFormat" is in AOSP but not CAF
      case HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED: // Nexus 5
        if (img.flexFormat == HAL_PIXEL_FORMAT_YCbCr_420_888) {
          frameformat = "yvu420sp";
          break;
        }
#endif
        //fall through
      default:
        ALOGW("Unsupported preview format: 0x%x", img.format);
        frameformat = "unknown";
      }
    }

    // OpenCV currently always expects YUV420-sized frames.
    size_t expectedFrameDataSize = framewidth * (3 * frameheight / 2);

    mCameraCallback(img.data, expectedFrameDataSize, mUserData);
    // OpenCV just made a copy of the image data in mCameraCallback() so release
    // the buffer.  TODO: Avoid this unnecessary memcpy.
    mCpuConsumer->unlockBuffer(img);
  }
}

static sp<PreviewFrameGrabber> sPreviewFrameGrabber;

void* initCameraConnectC(void* cameraCallback, int cameraId, void* userData)
{
  sp<ProcessState> ps = ProcessState::self();
  ps->startThreadPool();

  if (sPreviewFrameGrabber != NULL) {
    ALOGE("EUSERS");
    return NULL;
  }

  sPreviewFrameGrabber = PreviewFrameGrabber::create(cameraId,
    (CameraCallback) cameraCallback, userData);

  if (sPreviewFrameGrabber == NULL) {
    return NULL;
  }
  // Any non-null value will do. Only one camera is supported and its state is
  // held by sPreviewFrameGrabber.
  return (void *) 42;
}

void closeCameraConnectC(void** camera __unused)
{
  sPreviewFrameGrabber = NULL;
}

double getCameraPropertyC(void* camera __unused, int id __unused)
{
  if (sPreviewFrameGrabber == NULL) {
    return 0;
  }

  switch (id) {
  case ANDROID_CAMERA_PROPERTY_FRAMEWIDTH:
    return sPreviewFrameGrabber->framewidth;
    break;
  case ANDROID_CAMERA_PROPERTY_FRAMEHEIGHT:
    return sPreviewFrameGrabber->frameheight;
    break;
  case ANDROID_CAMERA_PROPERTY_PREVIEW_FORMAT_STRING:
    // String within a double!
    union {double d; const char *str;} hack;
    hack.str = sPreviewFrameGrabber->frameformat;
    return hack.d;
  default:
    return 0;
  }
}

void setCameraPropertyC(void* camera __unused, int id __unused,
  double value __unused)
{
}

void applyCameraPropertiesC(void** camera __unused)
{
}

void requestFrameC(void** camera __unused)
{
  if (sPreviewFrameGrabber != NULL) {
    ALOGV("requestFrameC");
    sPreviewFrameGrabber->requestFrame();
  }
}

