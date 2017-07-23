#include "SharedSimpleH264Encoder.h"

class SharedSimpleH264EncoderStub: public SharedSimpleH264Encoder {
 public:
  SharedSimpleH264EncoderStub(SimpleH264Encoder *encoder)
    : encoder(encoder) {}

  virtual ~SharedSimpleH264EncoderStub() {
    delete encoder;
  }

  virtual void setBitRate(int newBitrateK) override {
    encoder->setBitRate(newBitrateK);
  }

  virtual void requestKeyFrame() override {
    encoder->requestKeyFrame();
  }

  virtual bool getInputFrame(InputFrame& inputFrame) override {
    return encoder->getInputFrame(inputFrame);
  }

  virtual void nextFrame(InputFrame& inputFrame,
                         InputFrameInfo& inputFrameInfo) override {
    encoder->nextFrame(inputFrame, inputFrameInfo);
  }

  virtual void stop() override {
    encoder->stop();
  }

  virtual bool error() override {
    return encoder->error();
  }

  virtual bool isPrimary() override {
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

