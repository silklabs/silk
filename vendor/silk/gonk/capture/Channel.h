/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#ifndef CHANNEL_H_
#define CHANNEL_H_

#include "Capturedefs.h"
#include "SocketListener1.h"

/**
 * This class implements the data socket listener and sends the data to node
 * module over the {@code CAPTURE_DATA_SOCKET_NAME} socket
 */
class Channel: public SocketListener1 {
public:
  Channel() :
      SocketListener1(CAPTURE_DATA_SOCKET_NAME, true) {
  }
  void send(int32_t tag, const void *data, size_t size);
  void send(int32_t tag, timeval &when, const void *data, size_t size);

protected:
  virtual bool onDataAvailable(SocketClient *c) {
    return true;
  };

private:
  void send(const void *data, size_t size);

  template<typename T>
  void send(T value) {
    sendData(&value, sizeof(T));
  }
};

#endif
