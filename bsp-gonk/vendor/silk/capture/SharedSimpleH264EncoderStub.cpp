#include "SharedSimpleH264Encoder.h"

class SharedSimpleH264EncoderStub: public SharedSimpleH264Encoder {
 public:
  SharedSimpleH264EncoderStub(SimpleH264Encoder *encoder)
    : encoder(encoder) {}

  virtual ~SharedSimpleH264EncoderStub() {
    delete encoder;
  }

  virtual void setBitRate(int newBitrateK) {
    encoder->setBitRate(newBitrateK);
  }

  virtual void requestKeyFrame() {
    encoder->requestKeyFrame();
  }

  virtual void nextFrame(void *yuv420SemiPlanarFrame,
                         void (*deallocator)(void *),
                         InputFrameInfo& inputFrameInfo) {
    encoder->nextFrame(yuv420SemiPlanarFrame, deallocator, inputFrameInfo);
  }

  virtual void stop() {
    encoder->stop();
  }

  virtual bool isPrimary() {
    return true;
  }

 private:
  SimpleH264Encoder *encoder;
};


SharedSimpleH264Encoder *
  SharedSimpleH264Encoder::Create(int width,
                                  int height,
                                  int maxBitrateK,
                                  int targetFps,
                                  FrameOutCallback frameOutCallback,
                                  void *frameOutUserData) {

  SimpleH264Encoder *encoder = SimpleH264Encoder::Create(
    width,
    height,
    maxBitrateK,
    targetFps,
    frameOutCallback,
    frameOutUserData
  );

  if (encoder == nullptr) {
    return nullptr;
  }

  return new SharedSimpleH264EncoderStub(encoder);
}

