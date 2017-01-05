#define LOG_TAG "silk-sharedh264-enc"
#include "SharedSimpleH264Encoder.h"

#include <vector>

#include <utils/Thread.h>
#include <utils/SystemClock.h>
#include <utils/Log.h>
#include <media/stagefright/MediaBuffer.h>

using namespace android;

class SharedSimpleH264EncoderImpl;
class EncoderPool;

static std::vector<std::shared_ptr<EncoderPool>> availablePools;


class EncoderPool {
 public:
  static std::shared_ptr<EncoderPool> Create(int width,
                                             int height,
                                             int maxBitrateK,
                                             int targetFps);
  void bitRateChanged(SharedSimpleH264EncoderImpl *who);
  void attach(SharedSimpleH264EncoderImpl *who);
  void detach(SharedSimpleH264EncoderImpl *who);
  bool isPrimary(SharedSimpleH264EncoderImpl *who);

  std::unique_ptr<SimpleH264Encoder> encoder; // The real encoder

  ~EncoderPool() {}
 private:
  EncoderPool(int width, int height, int maxBitrateK, int targetFps)
    : width(width), height(height), maxBitrateK(maxBitrateK), targetFps(targetFps) {
  }
  bool init();

  static void frameOutCallback(SimpleH264Encoder::EncodedFrameInfo& info);
  void dispatchFrameOutCallbacks(SimpleH264Encoder::EncodedFrameInfo& info);

  int width;
  int height;
  int maxBitrateK;
  int targetFps;

  std::vector<SharedSimpleH264EncoderImpl*> sharedEncoders;
  Mutex lock;
};


class SharedSimpleH264EncoderImpl: public SharedSimpleH264Encoder {
 public:
  SharedSimpleH264EncoderImpl(std::shared_ptr<EncoderPool> encoderPool,
                              int bitrateK,
                              FrameOutCallback frameOutCallback,
                              void *frameOutUserData)
      : bitrateK(bitrateK),
        frameOutCallback(frameOutCallback),
        frameOutUserData(frameOutUserData),
        encoderPool(encoderPool) {

    encoderPool->attach(this);
  }

  virtual ~SharedSimpleH264EncoderImpl() {
    stop();
  }

  virtual void stop() {
    encoderPool->detach(this);
  }

  virtual void setBitRate(int newBitrateK) {
    bitrateK = newBitrateK;
    encoderPool->bitRateChanged(this);
  }

  virtual void requestKeyFrame() {
    encoderPool->encoder->requestKeyFrame();
  }

  virtual bool isPrimary() {
    return encoderPool->isPrimary(this);
  }

  virtual void nextFrame(void *yuv420SemiPlanarFrame, long long timeMillis, void (*deallocator)(void *)) {
    if (!encoderPool->isPrimary(this)) {
      ALOGI("Not primary, ignoring nextFrame");
      deallocator(yuv420SemiPlanarFrame);
      return;
    }
    encoderPool->encoder->nextFrame(yuv420SemiPlanarFrame, timeMillis, deallocator);
  }

  int bitrateK;
  FrameOutCallback frameOutCallback;
  void *frameOutUserData;

 private:
  std::shared_ptr<EncoderPool> encoderPool;
};


std::shared_ptr<EncoderPool> EncoderPool::Create(int width,
                                                 int height,
                                                 int maxBitrateK,
                                                 int targetFps) {

  std::shared_ptr<EncoderPool> encoderPool;

  // Check if there's an EncoderPool already available with the requested
  // parameters
  for (auto i = availablePools.begin(); i != availablePools.end(); ++i) {
    if ((*i)->width == width &&
        (*i)->height == height &&
        (*i)->maxBitrateK == maxBitrateK &&
        (*i)->targetFps == targetFps) {
      encoderPool = *i;
      break;
    }
  }

  if (encoderPool == nullptr) {
    encoderPool.reset(new EncoderPool(width, height, maxBitrateK, targetFps));
    if (!encoderPool->init()) {
      return nullptr;
    }
  }

  availablePools.push_back(encoderPool);
  return encoderPool;
}

bool EncoderPool::init() {
  encoder.reset(
    SimpleH264Encoder::Create(
      width,
      height,
      maxBitrateK,
      targetFps,
      frameOutCallback,
      this
    )
  );
  if (encoder != nullptr) {
    return true;
  }
  return false;
}

void EncoderPool::bitRateChanged(SharedSimpleH264EncoderImpl *who) {
  Mutex::Autolock autolock(lock);

  if (who->bitrateK >= sharedEncoders[0]->bitrateK) {
    // bitrate change doesn't matter
    return;
  }

  // run through the pool to find the shared encoder with the lowest bitrate.
  auto minBitrateIndex = 0u;
  for (auto i = 1u; i < sharedEncoders.size(); i++) {
    if (sharedEncoders[i]->bitrateK < sharedEncoders[minBitrateIndex]->bitrateK) {
      minBitrateIndex = i;
    }
  }

  if (minBitrateIndex > 0) {
    // Move new encoder to the front, it's now primary
    std::swap(sharedEncoders[0], sharedEncoders[minBitrateIndex]);
  }
}

void EncoderPool::attach(SharedSimpleH264EncoderImpl *who) {
  Mutex::Autolock autolock(lock);

  sharedEncoders.push_back(who);
}

void EncoderPool::detach(SharedSimpleH264EncoderImpl *who) {
  Mutex::Autolock autolock(lock);

  sharedEncoders.erase(
    std::remove(
      sharedEncoders.begin(),
      sharedEncoders.end(),
      who
    ),
    sharedEncoders.end()
  );

  if (sharedEncoders.size() == 0) {
    // Remove ourself from availablePools, no more users
    availablePools.erase(
      std::remove_if(
        availablePools.begin(),
        availablePools.end(),
        [this](std::shared_ptr<EncoderPool> aPool) {
          return aPool.get() == this;
        }
      ),
      availablePools.end()
    );
    return;
  }
}

bool EncoderPool::isPrimary(SharedSimpleH264EncoderImpl *who) {
  Mutex::Autolock autolock(lock);

  // The primary encoder is always the first in the list
  return (sharedEncoders.size() > 0) && (sharedEncoders[0] == who);
}

void EncoderPool::frameOutCallback(SimpleH264Encoder::EncodedFrameInfo& info) {
  EncoderPool *that = (EncoderPool *) info.userData;
  that->dispatchFrameOutCallbacks(info);
}

void EncoderPool::dispatchFrameOutCallbacks(SimpleH264Encoder::EncodedFrameInfo& info) {
  Mutex::Autolock autolock(lock);
  SimpleH264Encoder::EncodedFrameInfo localInfo = info;

  for (auto i = 0u; i < sharedEncoders.size(); i++) {
    localInfo.userData = sharedEncoders[i]->frameOutUserData;
    sharedEncoders[i]->frameOutCallback(localInfo);
  }
}


SharedSimpleH264Encoder *
  SharedSimpleH264Encoder::Create(int width,
                                  int height,
                                  int maxBitrateK,
                                  int targetFps,
                                  FrameOutCallback frameOutCallback,
                                  void *frameOutUserData) {

  std::shared_ptr<EncoderPool> encoderPool =
    EncoderPool::Create(width, height, maxBitrateK, targetFps);

  if (encoderPool == nullptr) {
    return nullptr;
  }

  return new SharedSimpleH264EncoderImpl(
    encoderPool,
    maxBitrateK,
    frameOutCallback,
    frameOutUserData
  );
}

