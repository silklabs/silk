#pragma once

#include <sys/time.h>
#define CAPTURE_MP4_DATA_SOCKET_NAME "silk_capture_mp4"
#define CAPTURE_PCM_DATA_SOCKET_NAME "silk_capture_pcm"
#define CAPTURE_H264_DATA_SOCKET_NAME "silk_capture_h264"

namespace capture {
namespace datasocket {

enum Tag {
  TAG_MP4 = 0, // Sent over CAPTURE_MP4_DATA_SOCKET_NAME
  TAG_FACES,   // Sent over CAPTURE_MP4_DATA_SOCKET_NAME
  TAG_PCM,     // Sent over CAPTURE_PCM_DATA_SOCKET_NAME
  TAG_H264_IDR,// Sent over CAPTURE_H264_DATA_SOCKET_NAME
  TAG_H264,    // Sent over CAPTURE_H264_DATA_SOCKET_NAME
  __MAX_TAG
};
struct PacketHeader {
  size_t size; // size of the packet, excluding this header
  int32_t tag; // of type Tag
  timeval when;
  int32_t durationMs;
};

typedef void (*FreeDataFunc)(void *freeData);

class Channel {
 public:
  struct Header {
    size_t size; // size of the packet, excluding this header
    int32_t tag; // of type Tag
    timeval when;
    int32_t durationMs;
  };

  Channel() {};
  virtual ~Channel() {};

  // is anybody connected to this channel?
  virtual bool connected() = 0;

  virtual void send(
    Tag tag,
    timeval &when,
    int32_t durationMs,
    const void *data,
    size_t size,
    FreeDataFunc freeDataFunc,
    void *freeData
  ) = 0;

  void send(
    Tag tag,
    const void *data,
    size_t size,
    FreeDataFunc freeDataFunc,
    void *freeData
  ) {
    timeval when;
    gettimeofday(&when, NULL);
    send(tag, when, 0, data, size, freeDataFunc, freeData);
  }
};

}
}

