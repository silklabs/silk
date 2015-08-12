/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#define LOG_TAG "mic"
#include <utils/Log.h>
#include <sys/time.h>

#include "Channel.h"
#include "Micdefs.h"

void Channel::send(int32_t tag, timeval &when, const void *data, size_t size) {
  if (sDebug) {
    ALOGI("tag:%d, size: %d, when:%ld.%ld\n", tag, size, when.tv_sec,
        when.tv_usec);
    return;
  }

  if (isSocketAvailable()) {
    send(int32_t(size));
    send(int32_t(tag));
    send(timeval(when));
    if (size > 0) {
      sendData(data, size);
    }
  } else {
    ALOGV("Socket not available; ignoring data");
  }
}

void Channel::send(int32_t tag, const void *data, size_t size) {
  timeval when;
  gettimeofday(&when, NULL);
  send(tag, when, data, size);
}
