/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#ifndef CHANNEL_H_
#define CHANNEL_H_

#include "Capturedefs.h"
#include "SocketListener1.h"
#include <utils/Mutex.h>

/**
 * This class implements the data socket listener and sends the data to node
 * module over the {@code CAPTURE_DATA_SOCKET_NAME} socket
 */
class Channel: public SocketListener1 {
public:
  enum Tag {
    TAG_VIDEO = 0,
    TAG_PREVIEW,
    TAG_FACES,
    TAG_MIC,
  };
  struct Header {
    size_t size; // size of the packet, excluding this header
    int32_t tag; // of type Tag
    timeval when;
  };

  Channel() :
      SocketListener1(CAPTURE_DATA_SOCKET_NAME, true) {
  }
  void send(Tag tag, const void *data, size_t size);
  void send(Tag tag, timeval &when, const void *data, size_t size);

protected:
  virtual bool onDataAvailable(SocketClient *c) {
    return true;
  };
private:
  Mutex mLock;
};

#endif
