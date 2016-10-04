#ifndef GONKVIDEODEVICECAPTURERFACTORY_H
#define GONKVIDEODEVICECAPTURERFACTORY_H

#include "webrtc/media/base/videocapturerfactory.h"

class GonkVideoDeviceCapturerFactory: public cricket::VideoDeviceCapturerFactory {
 public:
  virtual cricket::VideoCapturer* Create(const cricket::Device& device) override;
};

#endif // GONKVIDEODEVICECAPTURERFACTORY_H
