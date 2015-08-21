/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-Channel"
#include <utils/Log.h>

#include "Channel.h"
#include <sys/time.h>

/**
 *
 */
void Channel::send(Tag tag, timeval &when, const void *data, size_t size) {
  ALOGV("tag:%d, size: %d, when:%ld.%ld\n", tag, size, when.tv_sec, when.tv_usec);

  if (isSocketAvailable()) {
    Mutex::Autolock autoLock(mLock);

    Header header = { size, tag, when };
    sendData(&header, sizeof(header));
    if (size > 0) {
      sendData(data, size);
    }
  } else {
    ALOGV("Socket not available; ignoring data");
  }
}

/**
 *
 */
void Channel::send(Tag tag, const void *data, size_t size) {
  timeval when;
  gettimeofday(&when, NULL);
  send(tag, when, data, size);
}
