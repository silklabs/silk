#ifndef VIDEOENCODERFACTORY_H
#define VIDEOENCODERFACTORY_H

#include "webrtc/media/engine/webrtcvideoencoderfactory.h"
#ifdef ANDROID
#include "GonkVideoEncoderFactory.h"
#endif

inline cricket::WebRtcVideoEncoderFactory *CreateVideoEncoderFactory() {
#ifdef ANDROID
  return new GonkVideoEncoderFactory();
#else
  return nullptr;
#endif
}

#endif // VIDEOENCODERFACTORY_H
