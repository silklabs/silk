/**
 * Dumps PCM data from the silk-capture data socket to a file
 */

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <cutils/sockets.h>

#include "CaptureDataSocket.h"

int main(int argc, char **argv)
{
  const char *file = "/data/capture.pcm";
  if (argc > 1) {
    file = argv[1];
  }
  int socket = socket_local_client(
    CAPTURE_PCM_DATA_SOCKET_NAME,
    ANDROID_SOCKET_NAMESPACE_RESERVED,
    SOCK_STREAM
  );

  if (socket < 0) {
    printf(
      "Error connecting to " CAPTURE_PCM_DATA_SOCKET_NAME " socket: %d\n",
      errno
    );
    return 1;
  }

  printf("Writing PCM data to %s\n", file);
  int fd = open(file, O_WRONLY | O_CREAT, 0440);
  if (fd < 0) {
    perror(NULL);
    return errno;
  }
  printf("^C to stop\n");

  for (;;) {
    capture::datasocket::PacketHeader hdr;
    int rc;

    rc = TEMP_FAILURE_RETRY(read(socket, &hdr, sizeof(hdr)));
    if (rc <= 0) {
      printf("Header read error: %d (read %d bytes)\n", errno, rc);
      return 1;
    }
    if (rc != (int) sizeof(hdr)) {
      printf(
        "Incomplete header.  Expected %zu bytes, got %d bytes\n",
        sizeof(hdr),
        rc
      );
      return 1;
    }

    if (hdr.size < sizeof(capture::datasocket::PacketHeader)) {
      printf("BAD HEADER: %d (%s)\n", rc, strerror(errno));
      return 1;
    }
    printf("Header with tag=%d size=%zu\n", hdr.tag, hdr.size);

    char *buffer = (char *) malloc(hdr.size);
    memset(buffer, 0, sizeof(hdr.size));
    rc = TEMP_FAILURE_RETRY(read(socket, buffer, hdr.size));
    if (rc <= 0) {
      printf("Data read error: %d (read %d bytes)\n", errno, rc);
      return 1;
    }
    if (rc != (int) hdr.size) {
      printf(
        "Incomplete data.  Expected %zu bytes, got %d bytes\n",
        hdr.size,
        rc
      );
      return 1;
    }
    if (hdr.tag == capture::datasocket::TAG_PCM) {
      TEMP_FAILURE_RETRY(write(fd, buffer, hdr.size));
    }
    free(buffer);
  }
  return 0;
}
