/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#include "FaceDetection.h"

FaceDetection::FaceDetection(Channel *channel) :
    mChannel(channel) {
}

void FaceDetection::notify(int32_t msgType, int32_t ext1, int32_t ext2) {
  (void) msgType;
  (void) ext1;
  (void) ext2;
}

void FaceDetection::postData(int32_t msgType, const sp<IMemory>& dataPtr,
    camera_frame_metadata_t *metadata) {
  (void) dataPtr;
  if ((CAMERA_MSG_PREVIEW_METADATA & msgType) && metadata) {
    mChannel->send(Channel::TAG_FACES, metadata->faces,
        sizeof(camera_face_t) * metadata->number_of_faces);
  }
}

void FaceDetection::postDataTimestamp(nsecs_t timestamp, int32_t msgType,
    const sp<IMemory>& dataPtr) {
  (void) timestamp;
  (void) msgType;
  (void) dataPtr;
}
