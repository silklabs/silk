#define LOG_TAG "silk-h264-enc"
#include "SimpleH264Encoder.h"

#include <queue>

#include <media/stagefright/MediaBuffer.h>
#include <media/stagefright/MetaData.h>
// This is an ugly hack. We forked this from libstagefright
// so we can trigger key frames and adjust bitrate
#include "MediaCodecSource.h"
#include <media/openmax/OMX_IVCommon.h>
#include <media/stagefright/OMXCodec.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/foundation/AMessage.h>
#include <utils/Thread.h>
#include <utils/SystemClock.h>
#include <utils/Log.h>

using namespace android;

static const char* kMimeTypeAvc = "video/avc";
static const uint32_t kColorFormat = OMX_COLOR_FormatYUV420SemiPlanar;
static const int32_t kIFrameInterval = 3;

class SingleBufferMediaSource: public MediaSource {
 public:
  SingleBufferMediaSource(int width, int height)
      : mBuffer(0), mHaveNextBuffer(false) {
    mMetaData = new MetaData();
    mMetaData->setInt32(kKeyWidth, width);
    mMetaData->setInt32(kKeyHeight, height);
    mMetaData->setInt32(kKeyStride, width);
    mMetaData->setInt32(kKeySliceHeight, height);
    mMetaData->setInt32(kKeyColorFormat, kColorFormat);
    mMetaData->setCString(kKeyMIMEType, "video/raw");
  }

  status_t start(MetaData *params = NULL) override {
    (void) params;
    return 0;
  }

  status_t stop() override {
    nextFrame(nullptr); // Unclog read
    return 0;
  }

  sp<MetaData> getFormat() override {
    return mMetaData;
  }

  status_t read(MediaBuffer **buffer, const ReadOptions *options = NULL) override {
    Mutex::Autolock autolock(mBufferLock);

    if (options != NULL) {
      ALOGW("ReadOptions not supported");
      return ERROR_END_OF_STREAM;
    }

    while (!mHaveNextBuffer) {
      mBufferCondition.wait(mBufferLock);
    }
    mHaveNextBuffer = false;

    if (!mBuffer) {
      ALOGI("End of stream");
      return ERROR_END_OF_STREAM;
    }

    *buffer = mBuffer;
    mBuffer = nullptr;
    return ::OK;
  }

  void nextFrame(android::MediaBuffer *yuv420SemiPlanarFrame) {
    Mutex::Autolock autolock(mBufferLock);
    if (mBuffer) {
      mBuffer->release();
    }
    mBuffer = yuv420SemiPlanarFrame;
    mHaveNextBuffer = true;
    mBufferCondition.signal();
  }

 private:
  MediaBuffer *mBuffer;
  bool mHaveNextBuffer;
  Mutex mBufferLock;
  Condition mBufferCondition;

  sp<MetaData> mMetaData;
};


class SimpleH264EncoderImpl: public SimpleH264Encoder {
 public:
  static SimpleH264Encoder *Create(int width,
                                   int height,
                                   int maxBitrateK,
                                   int targetFps,
                                   FrameOutCallback frameOutCallback,
                                   void *frameOutUserData);
  virtual ~SimpleH264EncoderImpl() {
    stop();
  }
  virtual void setBitRate(int bitrateK);
  virtual void requestKeyFrame();
  virtual void nextFrame(void *yuv420SemiPlanarFrame,
                         void (*deallocator)(void *),
                         InputFrameInfo& inputFrameInfo);
  virtual void stop();

 private:
  class FramePuller: public android::Thread {
   public:
    FramePuller(SimpleH264EncoderImpl *encoder): encoder(encoder) {};
   private:
    bool threadLoop() override {
      return encoder->threadLoop();
    }
    SimpleH264EncoderImpl *encoder;
  };
  friend class FramePuller;


  SimpleH264EncoderImpl(int width,
                        int height,
                        int maxBitrateK,
                        FrameOutCallback frameOutCallback,
                        void *frameOutUserData);

  bool init(int targetFps);
  bool threadLoop();

  int width;
  int height;
  int maxBitrateK;
  FrameOutCallback frameOutCallback;
  void *frameOutUserData;
  uint8_t *codecConfig;
  int codecConfigLength;

  uint8_t *encodedFrame;
  int encodedFrameMaxLength;

  android::sp<android::ALooper> looper;
  android::sp<android::MediaCodecSource> mediaCodecSource;
  android::sp<SingleBufferMediaSource> frameQueue;
  android::sp<android::Thread> framePuller;
  std::queue<InputFrameInfo> frameInfo;
  android::Mutex mutex;
};


SimpleH264Encoder *SimpleH264EncoderImpl::Create(int width,
                                                 int height,
                                                 int maxBitrateK,
                                                 int targetFps,
                                                 FrameOutCallback frameOutCallback,
                                                 void *frameOutUserData) {
  SimpleH264EncoderImpl *enc = new SimpleH264EncoderImpl(
    width,
    height,
    maxBitrateK,
    frameOutCallback,
    frameOutUserData
  );

  if (!enc->init(targetFps)) {
    delete enc;
    enc = nullptr;
  };

  return enc;

bail:
  delete enc;
  return nullptr;
}



SimpleH264EncoderImpl::SimpleH264EncoderImpl(int width,
                                             int height,
                                             int maxBitrateK,
                                             FrameOutCallback frameOutCallback,
                                             void *frameOutUserData)
    : width(width),
      height(height),
      maxBitrateK(maxBitrateK),
      frameOutCallback(frameOutCallback),
      frameOutUserData(frameOutUserData),
      codecConfig(nullptr),
      codecConfigLength(0),
      encodedFrame(nullptr),
      encodedFrameMaxLength(0) {

  frameQueue = new SingleBufferMediaSource(width, height);
  looper = new ALooper;
  looper->setName("SimpleH264Encoder");
  framePuller = new SimpleH264EncoderImpl::FramePuller(this);
};

bool SimpleH264EncoderImpl::init(int targetFps) {
  sp<MetaData> meta = frameQueue->getFormat();
  int32_t width, height, stride, sliceHeight, colorFormat;
  CHECK(meta->findInt32(kKeyWidth, &width));
  CHECK(meta->findInt32(kKeyHeight, &height));
  CHECK(meta->findInt32(kKeyStride, &stride));
  CHECK(meta->findInt32(kKeySliceHeight, &sliceHeight));
  CHECK(meta->findInt32(kKeyColorFormat, &colorFormat));

  sp<AMessage> format = new AMessage();
  format->setInt32("width", width);
  format->setInt32("height", height);
  format->setInt32("stride", stride);
  format->setInt32("slice-height", sliceHeight);
  format->setInt32("color-format", colorFormat);

  format->setString("mime", kMimeTypeAvc);
  format->setInt32("bitrate", maxBitrateK * 1024);
  format->setInt32("bitrate-mode", OMX_Video_ControlRateConstant);
  format->setFloat("frame-rate", targetFps);
  format->setInt32("i-frame-interval", kIFrameInterval);

  looper->start();
  mediaCodecSource = MediaCodecSource::Create(
    looper,
    format,
    frameQueue,
#ifdef TARGET_GE_MARSHMALLOW
    NULL,
#endif
    0
  );
  if (mediaCodecSource == nullptr) {
    ALOGE("Unable to create encoder");
    return false;
  }

  status_t err;
  err = mediaCodecSource->start();
  if (err != 0) {
    ALOGE("Unable to start encoder");
    return false;
  }
  err = framePuller->run();
  if (err != 0) {
    ALOGE("Unable to start puller thread");
    return false;
  }
  return true;
}


void SimpleH264EncoderImpl::setBitRate(int bitrateK) {
  Mutex::Autolock autolock(mutex);
  if (mediaCodecSource != nullptr) {
    mediaCodecSource->videoBitRate(
      (bitrateK < maxBitrateK ? bitrateK : maxBitrateK) * 1024
    );
  }
}

void SimpleH264EncoderImpl::requestKeyFrame() {
  Mutex::Autolock autolock(mutex);
  if (mediaCodecSource != nullptr) {
    mediaCodecSource->requestIDRFrame();
  }
}

class UserMediaBuffer: public android::MediaBuffer {
 public:
  UserMediaBuffer(void *data, size_t size, void (*deallocator)(void *))
    : MediaBuffer(data, size),
      deallocator(deallocator) {}

 protected:
  ~UserMediaBuffer() {
    deallocator(data());
  }
 private:
  void (*deallocator)(void *);
};

void SimpleH264EncoderImpl::nextFrame(void *yuv420SemiPlanarFrame,
                                      void (*deallocator)(void *),
                                      InputFrameInfo& inputFrameInfo) {
  Mutex::Autolock autolock(mutex);
  if (frameQueue == nullptr) {
    ALOGI("Stopped, ignoring frame");
    return;
  }

  auto buffer = new UserMediaBuffer(
    yuv420SemiPlanarFrame,
    height * width * 3 / 2,
    deallocator
  );
  buffer->meta_data()->setInt64(kKeyTime, inputFrameInfo.captureTimeMs * 1000);
  frameInfo.push(inputFrameInfo);
  frameQueue->nextFrame(buffer);
}


void SimpleH264EncoderImpl::stop() {
  Mutex::Autolock autolock(mutex);
  framePuller->requestExit();

  if (mediaCodecSource != nullptr) {
    mediaCodecSource->stop();
  }

  if (frameQueue != nullptr) {
    frameQueue->stop();
  }

  if (looper != nullptr) {
    looper->stop();
  }

  if (framePuller->isRunning()) {
    framePuller->join();
    CHECK(!framePuller->isRunning());
  }

  frameQueue = nullptr;
  mediaCodecSource = nullptr;
  looper = nullptr;

  delete [] codecConfig;
  codecConfig = nullptr;
  codecConfigLength = 0;

  delete [] encodedFrame;
  encodedFrame = nullptr;
  encodedFrameMaxLength = 0;
}

bool SimpleH264EncoderImpl::threadLoop() {
  MediaBuffer *buffer;

  status_t err = mediaCodecSource->read(&buffer);
  if (err != ::OK) {
    ALOGE("Error reading from source: %d", err);
    return false;
  }

  if (buffer == NULL) {
    ALOGE("Failed to get buffer from source");
    return false;
  }

  int32_t isCodecConfig = 0;
  int32_t isIFrame = 0;
  int64_t timestamp = 0;

  if (buffer->meta_data() == NULL) {
    ALOGE("Failed to get buffer meta_data()");
    return false;
  }

  buffer->meta_data()->findInt32(kKeyIsCodecConfig, &isCodecConfig);
  buffer->meta_data()->findInt32(kKeyIsSyncFrame, &isIFrame);

  if (isCodecConfig) {
    if (codecConfig) {
      delete [] codecConfig;
    }
    codecConfigLength = buffer->range_length();
    codecConfig = new uint8_t[codecConfigLength];
    memcpy(codecConfig,
      static_cast<uint8_t*>(buffer->data()) + buffer->range_offset(),
      codecConfigLength
    );

  } else {
    EncodedFrameInfo info;
    bool drop = false;
    info.userData = frameOutUserData;
    info.keyFrame = isIFrame;
    int64_t timeMicro = 0;
    buffer->meta_data()->findInt64(kKeyTime, &timeMicro);
    info.input.captureTimeMs = timeMicro / 1000;

    {
      Mutex::Autolock autolock(mutex);
      for (;;) {
        if (frameInfo.empty()) {
          ALOGE("frameInfo exhausted. Encoder broken?");
          drop = true;
          break;
        }
        InputFrameInfo& ifi = frameInfo.front();
        if (ifi.captureTimeMs != info.input.captureTimeMs) {
          ALOGE("Unknown frame. Encoder broken?");
          frameInfo.pop();
          continue;
        }
        info.input = ifi;
        frameInfo.pop();
        break;
      }
    }

    if (!drop) {
      if (isIFrame) {
        int encodedFrameLength = codecConfigLength + buffer->range_length();

        if (encodedFrame == nullptr ||
            encodedFrameMaxLength < encodedFrameLength) {
          encodedFrameMaxLength = encodedFrameLength + encodedFrameLength / 2;
          delete [] encodedFrame;
          encodedFrame = new uint8_t[encodedFrameMaxLength];
        }

        // Always send codecConfig with an i-frame to make the stream more
        // resilient
        if (codecConfig) {
          memcpy(encodedFrame, codecConfig, codecConfigLength);
        }
        memcpy(
          encodedFrame + codecConfigLength,
          static_cast<uint8_t*>(buffer->data()) + buffer->range_offset(),
          buffer->range_length()
        );
        info.encodedFrame = encodedFrame;
        info.encodedFrameLength = encodedFrameLength;
      } else {
        info.encodedFrame = static_cast<uint8_t*>(buffer->data()) + buffer->range_offset();
        info.encodedFrameLength = buffer->range_length();
      }
      frameOutCallback(info);
    }
  }

  buffer->release();
  return true;
}


SimpleH264Encoder *SimpleH264Encoder::Create(int width,
                                             int height,
                                             int maxBitrateK,
                                             int targetFps,
                                             FrameOutCallback frameOutCallback,
                                             void *frameOutUserData) {
  return SimpleH264EncoderImpl::Create(
    width,
    height,
    maxBitrateK,
    targetFps,
    frameOutCallback,
    frameOutUserData
  );
}

