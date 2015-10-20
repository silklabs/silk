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
  PreviewFrameGrabber(CameraCallback cameraCallback, void *userData)
    : mCameraCallback(cameraCallback), mUserData(userData)
  {
    lastFrame.data = NULL;

    // Always grab the first frame to obtain the framewidth/frameheight
    grabFrame = true;

    // Setup a BufferQueue. Two buffers are needed as the grabbed frame is held
    // until OpenCV requests the next frame.
    sp<IGraphicBufferConsumer> consumer;
    BufferQueue::createBufferQueue(&producer, &consumer);
    mCpuConsumer = new CpuConsumer(consumer, 2, true);
    mCpuConsumer->setName(String8("OpenCVCpuConsumer"));
    mCpuConsumer->setFrameAvailableListener(this);
  };

  virtual ~PreviewFrameGrabber() {
    unlockLastFrame();
  }

  void requestFrame() {
    grabFrame = true;
  }

  char const *getFormat();
  size_t framewidth;
  size_t frameheight;

  sp<IGraphicBufferProducer> producer;

#ifdef CAF_CPUCONSUMER
  virtual void onFrameAvailable();
#else
  virtual void onFrameAvailable(const BufferItem& item);
#endif

private:
  sp<CpuConsumer> mCpuConsumer;
  CameraCallback mCameraCallback;
  void *mUserData;
  bool grabFrame;
  CpuConsumer::LockedBuffer lastFrame;
  void unlockLastFrame();
};

char const *PreviewFrameGrabber::getFormat()
{
  //
  // Note that OpenCV currently only supports yvu420sp/yuv420sp...
  //
  switch (lastFrame.format) {
  case HAL_PIXEL_FORMAT_RGBA_8888: // QEmu
    // TODO: Either fix the emulator to return yuv420sp/yvu420sp, perform a RGB
    // to YUV conversion here, or fix OpenCV to understand RGB frames.  In the
    // meantime this little hack enables at least some data to flow through the
    // OpenCV camera subsystem in the emulator, which is better than nothing.
    //hack.str = "rgba8888";
    ALOGW("QEmu hack: pretending rgba8888 frame is yuv420sp...");
    return "yuv420sp";

  case HAL_PIXEL_FORMAT_YCrCb_420_SP: // Nexus 4
    return "yvu420sp";

#ifndef CAF_CPUCONSUMER // "flexFormat" is in AOSP but not CAF
  case HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED: // Nexus 5
    if (lastFrame.flexFormat == HAL_PIXEL_FORMAT_YCbCr_420_888) {
      return "yvu420sp";
      break;
    }
#endif
    //fall through
  default:
    ALOGW("Unsupported preview format: 0x%x", lastFrame.format);
    return "unknown";
  }
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
    } else {
      if (grabFrame) {
        grabFrame = false;
        unlockLastFrame();

#ifdef CAF_CPUCONSUMER
        ALOGV("Frame: data=%p %ux%u  fmt=%x", img.data, img.width, img.height, img.format);
#else
        ALOGV("Frame: data=%p %ux%u  fmt=%x flexfmt=%x", img.data, img.width, img.height, img.format, img.flexFormat);
#endif
        ALOGV("Frame: xform=%d stride=%x dataCb=%p dataCr=%p", img.transform, img.stride, img.dataCb, img.dataCr);
        ALOGV("Frame: scalingMode=%d, chromaStride=%d chromaStep=%d", img.scalingMode, img.chromaStride, img.chromaStep);
        ALOGV("Frame: frameNumber=%lld, timestamp=%lld", img.frameNumber, img.timestamp);

        framewidth = img.width;
        frameheight = img.height;

        // OpenCV currently always expects YUV420-sized frames.
        size_t expectedFrameDataSize = framewidth * (3 * frameheight / 2);

        mCameraCallback(img.data, expectedFrameDataSize, mUserData);
        lastFrame = img;
      } else {
        // TODO: Don't map the buffer within CpuConsumer when a frame is not requested
        err = mCpuConsumer->unlockBuffer(img);
        if (err) {
          ALOGE("PreviewFrameGrabber: unlockBuffer error: %d", err);
        }
      }
    }
  }
}


void PreviewFrameGrabber::unlockLastFrame() {
  if (lastFrame.data != NULL) {
    status_t err = mCpuConsumer->unlockBuffer(lastFrame);
    if (err) {
      ALOGE("PreviewFrameGrabber::unlockLastFrame: error: %d", err);
    }
    lastFrame.data = NULL;
  }
}

static sp<PreviewFrameGrabber> mPreviewFrameGrabber;


void* initCameraConnectC(void* cameraCallback, int cameraId, void* userData)
{
  sp<ProcessState> ps = ProcessState::self();
  ps->startThreadPool();

  sp<IServiceManager> sm = defaultServiceManager();
  sp<IBinder> binder = sm->getService(String16(OpenCVCameraCapture::getServiceName()));
  if (binder == NULL) {
    ALOGE("Unable to connect with capture preview service");
    return NULL;
  }

  mPreviewFrameGrabber = new PreviewFrameGrabber((CameraCallback) cameraCallback, userData);
  sp<IOpenCVCameraCapture> wrapper = interface_cast<IOpenCVCameraCapture>(binder);
  status_t err = wrapper->initCamera(cameraId, mPreviewFrameGrabber->producer);

  if (err != OK) {
    ALOGW("initCameraConnectC: camera init failed: %d", err);
    mPreviewFrameGrabber = NULL;
    return NULL;
  }

  wrapper->incStrong(NULL);
  return wrapper.get();
}

void closeCameraConnectC(void** camera)
{
  IOpenCVCameraCapture* wrapper = *(IOpenCVCameraCapture **) camera;

  if (wrapper != NULL) {
    mPreviewFrameGrabber = NULL;
    wrapper->closeCamera();
    wrapper->decStrong(NULL);
    *camera = NULL;
  }
}

double getCameraPropertyC(void* camera, int id)
{
  (void) camera;
  (void) id;

  switch (id) {
  case ANDROID_CAMERA_PROPERTY_FRAMEWIDTH:
    return mPreviewFrameGrabber->framewidth;
    break;
  case ANDROID_CAMERA_PROPERTY_FRAMEHEIGHT:
    return mPreviewFrameGrabber->frameheight;
    break;
  case ANDROID_CAMERA_PROPERTY_PREVIEW_FORMAT_STRING:
    // String within a double!
    union {double d; const char *str;} hack;
    hack.str = mPreviewFrameGrabber->getFormat();
    return hack.d;
  default:
    return 0;
  }
}

void setCameraPropertyC(void* camera, int id, double value)
{
  (void) camera;
}

void applyCameraPropertiesC(void** camera)
{
  (void) camera;
}

void requestFrameC(void** camera)
{
  IOpenCVCameraCapture* wrapper = *(IOpenCVCameraCapture **) camera;
  if (wrapper != NULL) {
    mPreviewFrameGrabber->requestFrame();
  }
}

