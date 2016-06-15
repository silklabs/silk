/**
 * Dumps PCM data from the silk-capture data socket to stdout.
 * (Look in logcat for error messages.)
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture-mic"
#include <utils/Log.h>

#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <cutils/sockets.h>
#include <private/android_filesystem_config.h>

#include "Channel.h"
#include "Capturedefs.h"

int main(int argc, char **argv)
{
  int socket = socket_local_client(CAPTURE_DATA_SOCKET_NAME,
                                   ANDROID_SOCKET_NAMESPACE_RESERVED,
                                   SOCK_STREAM);

  if (socket < 0) {
    ALOGE("Error connecting to " CAPTURE_DATA_SOCKET_NAME " socket: %d", errno);
    return 1;
  }

  for (;;) {
    Channel::Header hdr;
    int rc;

    rc = TEMP_FAILURE_RETRY(read(socket, &hdr, sizeof(hdr)));
    if (rc <= 0) {
      ALOGE("Header read error: %d (read %d bytes)", errno, rc);
      return 1;
    }
    if (rc != (int) sizeof(hdr)) {
      ALOGE("Incomplete header.  Expected %d bytes, got %d bytes", sizeof(hdr), rc);
      return 1;
    }

    if (hdr.size < sizeof(Channel::Header)) {
      fprintf(stderr, "BAD HEADER: %d (%s)\n", rc, strerror(errno));
      return 1;
    }
    ALOGD("Header with tag=%d size=%d\n", hdr.tag, hdr.size);

    char *buffer = (char *) malloc(hdr.size);
    memset(buffer, 0, sizeof(hdr.size));
    rc = TEMP_FAILURE_RETRY(read(socket, buffer, hdr.size));
    if (rc <= 0) {
      ALOGE("Data read error: %d (read %d bytes)", errno, rc);
      return 1;
    }
    if (rc != (int) hdr.size) {
      ALOGE("Incomplete data.  Expected %d bytes, got %d bytes", hdr.size, rc);
      return 1;
    }
    if (hdr.tag == Channel::TAG_MIC) {
      TEMP_FAILURE_RETRY(write(1, buffer, hdr.size));
    }
    free(buffer);
  }
  return 0;
}
