#ifndef CHANNEL_H_
#define CHANNEL_H_

#include <utils/List.h>
#include <utils/Mutex.h>
#include <utils/StrongPointer.h>
namespace android {
class Looper;
}

#include "Capturedefs.h"
#include "SocketListener1.h"


/**
 * This class implements the data socket listener and sends the data to node
 * module over the {@code CAPTURE_DATA_SOCKET_NAME} socket
 */
class Channel: public SocketListener1 {
public:
  enum Tag {
    TAG_VIDEO = 0,
    TAG_FACES,
    TAG_MIC,
    __MAX_TAG
  };
  struct Header {
    size_t size; // size of the packet, excluding this header
    int32_t tag; // of type Tag
    timeval when;
    int32_t durationMs;
  };

  Channel();
  ~Channel();

  typedef void (*FreeDataFunc)(void *freeData);

  void send(Tag tag, const void *data, size_t size,
            FreeDataFunc freeDataFunc, void *freeData);
  void send(Tag tag, timeval &when, int32_t durationMs,
            const void *data, size_t size,
            FreeDataFunc freeDataFunc, void *freeData);

protected:
  virtual bool onDataAvailable(SocketClient *c) {
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

#endif
