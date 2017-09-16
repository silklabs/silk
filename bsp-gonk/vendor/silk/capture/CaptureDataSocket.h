#ifndef CAPTUREDATASOCKET_H
#define CAPTUREDATASOCKET_H

#define CAPTURE_MP4_DATA_SOCKET_NAME "silk_capture_mp4"
#define CAPTURE_PCM_DATA_SOCKET_NAME "silk_capture_pcm"

namespace capture {
namespace datasocket {

enum Tag {
  TAG_MP4 = 0, // Sent over CAPTURE_MP4_DATA_SOCKET_NAME
  TAG_FACES,   // Sent over CAPTURE_MP4_DATA_SOCKET_NAME
  TAG_PCM,     // Sent over CAPTURE_PCM_DATA_SOCKET_NAME
  __MAX_TAG
};
struct PacketHeader {
  size_t size; // size of the packet, excluding this header
  int32_t tag; // of type Tag
  timeval when;
  int32_t durationMs;
};

}
}
#endif
