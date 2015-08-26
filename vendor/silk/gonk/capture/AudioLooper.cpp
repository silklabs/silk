/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "capture"

#include <media/stagefright/MediaBuffer.h>
#include <utils/Log.h>
#include "AudioLooper.h"

using namespace android;

AudioLooper::AudioLooper(const sp<MediaSource> &source) :
    mSource(source) {
}

bool AudioLooper::threadLoop() {
  mSource->start();

  while (true) {
    MediaBuffer *buffer;
    status_t err = mSource->read(&buffer);

    if (err == ::OK && buffer) {
      buffer->release();
      buffer = NULL;
    }
  }
  return true;
}
