#include "FaceDetection.h"
#undef LOG_TAG
#define LOG_TAG "silk-capture-fd"
#include <utils/Log.h>

FaceDetection::FaceDetection(Channel *channel) :
    mChannel(channel), focusMoving(false) {
}

void FaceDetection::notify(int32_t msgType, int32_t ext1, int32_t ext2) {
  (void) msgType;
  (void) ext1;
  (void) ext2;
  if (msgType == CAMERA_MSG_FOCUS_MOVE) {
    if ( (ext1 == 1) != focusMoving) {
      focusMoving = ext1 == 1;
      ALOGW("Camera focus moving: %d", focusMoving);
    }
  } else if (msgType == CAMERA_MSG_FOCUS) {
    ALOGD("Camera focus result: %d", ext1);
  } else {
    ALOGD("notify: msgType=0x%x ext1=%d ext2=%d", msgType, ext1, ext2);
  }
}

void FaceDetection::postData(int32_t msgType, const sp<IMemory>& dataPtr,
    camera_frame_metadata_t *metadata) {
  (void) dataPtr;
  if ((CAMERA_MSG_PREVIEW_METADATA & msgType) && metadata) {
    size_t size = sizeof(camera_face_t) * metadata->number_of_faces;
    void *faceData = malloc(size);
    if (faceData != nullptr) {
      memcpy(faceData, metadata->faces, size);
      mChannel->send(TAG_FACES, faceData, size, free, faceData);
    }
  } else {
    ALOGD("postData: msgType=0x%x", msgType);
  }
}

void FaceDetection::postDataTimestamp(nsecs_t timestamp, int32_t msgType,
    const sp<IMemory>& dataPtr) {
  (void) timestamp;
  (void) dataPtr;
  ALOGD("postDataTimestamp: msgType=0x%x", msgType);
}
