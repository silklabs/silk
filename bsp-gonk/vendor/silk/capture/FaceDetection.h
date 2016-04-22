#ifndef FACE_DETECTION_H_
#define FACE_DETECTION_H_

#include "Channel.h"
#include <camera/Camera.h>

/**
 *
 */
class FaceDetection: public CameraListener {
  Channel *mChannel;
public:
  FaceDetection(Channel *channel);

  void notify(int32_t msgType, int32_t ext1, int32_t ext2);
  void postData(int32_t msgType, const sp<IMemory>& dataPtr,
      camera_frame_metadata_t *metadata);
  void postDataTimestamp(nsecs_t timestamp, int32_t msgType,
      const sp<IMemory>& dataPtr);
private:
  bool focusMoving;
};


#endif
