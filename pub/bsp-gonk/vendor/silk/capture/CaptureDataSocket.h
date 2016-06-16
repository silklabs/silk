#ifndef CAPTUREDATASOCKET_H
#define CAPTUREDATASOCKET_H

#define CAPTURE_DATA_SOCKET_NAME "captured"

namespace capture {
namespace datasocket {

enum Tag {
  TAG_VIDEO = 0,
  TAG_FACES,
  TAG_MIC,
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
