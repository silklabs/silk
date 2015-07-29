#include "Channel.h"
#include <sys/time.h>

/**
 *
 */
void Channel::send(int32_t tag, timeval &when, const void *data, size_t size) {
  if (sDebug) {
    printf("tag:%d, size: %d, when:%ld.%ld\n", tag, size, when.tv_sec,
        when.tv_usec);
    return;
  }

  send(int32_t(size));
  send(int32_t(tag));
  send(timeval(when));
  sendData(data, size);
}

/**
 *
 */
void Channel::send(int32_t tag, const void *data, size_t size) {
  timeval when;
  gettimeofday(&when, NULL);
  send(tag, when, data, size);
}
