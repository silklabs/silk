#pragma once

#include <utils/List.h>
#include <utils/Mutex.h>
#include <utils/StrongPointer.h>
namespace android {
class Looper;
}

#include "SocketListener1.h"
#include "CaptureDataSocket.h"

/**
 * This class implements the data socket listener and sends the data to node
 * module over the {@code CAPTURE_DATA_SOCKET_NAME} socket
 */
using namespace android;
using namespace capture::datasocket;
class SocketChannel: public capture::datasocket::Channel, public SocketListener1 {
 public:
  SocketChannel(const char *socketName);
  virtual ~SocketChannel();

  virtual bool connected() override {
    return isSocketAvailable();
  }

  void send(
    Tag tag,
    timeval &when,
    int32_t durationMs,
    const void *data,
    size_t size,
    FreeDataFunc freeDataFunc,
    void *freeData
  ) override;

 protected:
  virtual bool onDataAvailable(SocketClient *c) {
    (void) c;
    return true;
  };

 private:
  struct QueuedPacket {
    Tag tag;
    timeval when;
    int32_t durationMs;
    const void *data;
    size_t size;
    FreeDataFunc freeDataFunc;
    void *freeData;

    QueuedPacket(Tag tag, timeval &when, int32_t durationMs,
                 const void *data, size_t size,
                 FreeDataFunc freeDataFunc, void *freeData)
      : tag(tag),
        when(when),
        durationMs(durationMs),
        data(data),
        size(size),
        freeDataFunc(freeDataFunc),
        freeData(freeData) {};

    ~QueuedPacket() {
      freeDataFunc(freeData);
    }
  };

  Mutex mPacketQueueLock; // Guards access to mPacketQueue and mPacketQueueByTag
  List<QueuedPacket *> mPacketQueue;
  int mPacketQueueByTag[__MAX_TAG];

  static void *startTransmitThread(void *);
  void transmitThread();
  sp<Looper> mTransmitLooper;
  pthread_t mTransmitThread;
};

