/**
 * Dumps h264 data from the silk-capture data socket to a file.
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
  const char *file = "/data/capture.h264";
  if (argc > 1) {
    file = argv[1];
  }
  int socket = socket_local_client(
    CAPTURE_H264_DATA_SOCKET_NAME,
    ANDROID_SOCKET_NAMESPACE_RESERVED,
    SOCK_STREAM
  );

  if (socket < 0) {
    printf(
      "Error connecting to " CAPTURE_H264_DATA_SOCKET_NAME " socket: %d\n",
      errno
    );
    return 1;
  }

  printf("Writing h264 data to %s\n", file);
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
        "Incomplete header.  Expected %d bytes, got %d bytes\n",
        sizeof(hdr),
        rc
      );
      return 1;
    }

    if (hdr.size < sizeof(capture::datasocket::PacketHeader)) {
      printf("BAD HEADER: %d (%s)\n", rc, strerror(errno));
      return 1;
    }
    printf("Header with tag=%d size=%d\n", hdr.tag, hdr.size);

    char *buffer = (char *) malloc(hdr.size);
    memset(buffer, 0, sizeof(hdr.size));
    rc = TEMP_FAILURE_RETRY(read(socket, buffer, hdr.size));
    if (rc <= 0) {
      printf("Data read error: %d (read %d bytes)\n", errno, rc);
      return 1;
    }
    if (rc != (int) hdr.size) {
      printf(
        "Incomplete data.  Expected %d bytes, got %d bytes\n",
        hdr.size,
        rc
      );
      return 1;
    }
    switch (hdr.tag) {
    case capture::datasocket::TAG_H264_IDR:
    case capture::datasocket::TAG_H264:
      TEMP_FAILURE_RETRY(write(fd, buffer, hdr.size));
      break;
    default:
      printf("Unsupported tag: %d\n", hdr.tag);
      return 1;
    }
    free(buffer);
  }
  return 0;
}
