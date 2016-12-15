#ifndef SHAREDSIMPLEH264ENCODER_H
#define SHAREDSIMPLEH264ENCODER_H

#include "SimpleH264Encoder.h"

class SharedSimpleH264Encoder : public SimpleH264Encoder {
 public:
  // If the SharedSimpleH264Encoder is not primary don't bother calling
  // nextFrame(), as only frames sent to the primary instance will be
  // processed
  virtual bool isPrimary() = 0; 
  
  static SharedSimpleH264Encoder *Create(int width,
                                         int height,
                                         int maxBitrateK,
                                         int targetFps,
                                         FrameOutCallback frameOutCallback,
                                         void *frameOutUserData);
};

#endif
