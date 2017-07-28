#ifndef SIMPLEH264ENCODER_H
#define SIMPLEH264ENCODER_H
/**
 * An H264 encoder with as few user-serviceable parts as possible
 */
#include <stdint.h>
#include <stddef.h>

class SimpleH264Encoder {
 public:
  struct InputFrame {
    void *data;  // format: yuv420sp (aka, nv12)
    size_t size;
    void (*deallocator)(void *);
  };

  struct InputFrameInfo {
    int64_t captureTimeMs;
    int64_t ntpTimeMs;
    uint32_t timestamp; // 90kHz
  };

  struct EncodedFrameInfo {
    void *userData;
    void *encodedFrame;
    int encodedFrameLength;
    bool keyFrame;
    InputFrameInfo input;
  };

  // Callback that receives the next encoded frame.
  // This is not your thread or data. Copy and return.
  typedef void (*FrameOutCallback)(EncodedFrameInfo& info);
  static SimpleH264Encoder *Create(int width,
                                   int height,
                                   int maxBitrateK,
                                   int targetFps,
                                   FrameOutCallback frameOutCallback,
                                   void *frameOutUserData);

  virtual ~SimpleH264Encoder() {};
  virtual void setBitRate(int bitrateK) = 0;
  virtual void requestKeyFrame() = 0;

  virtual bool getInputFrame(InputFrame& inputFrame) = 0;
  virtual void nextFrame(InputFrame& inputFrame,
                         InputFrameInfo& inputFrameInfo) = 0;
  virtual void stop() = 0;
  virtual bool error() = 0;
};

#endif
