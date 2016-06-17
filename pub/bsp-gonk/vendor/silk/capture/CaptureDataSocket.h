#ifndef CAPTUREDATASOCKET_H
#define CAPTUREDATASOCKET_H

#define CAPTURE_MIC_DATA_SOCKET_NAME "capturemic"
#define CAPTURE_VID_DATA_SOCKET_NAME "capturevid"

namespace capture {
namespace datasocket {

enum Tag {
  TAG_VIDEO = 0, // Sent over CAPTURE_VID_DATA_SOCKET_NAME
  TAG_FACES,     // Sent over CAPTURE_VID_DATA_SOCKET_NAME
  TAG_MIC,       // Sent over CAPTURE_MIC_DATA_SOCKET_NAME
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
