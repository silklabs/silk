//#define LOG_NDEBUG 0
#define LOG_TAG "silk-SocketChannel"
#include <log/log.h>

#include "SocketChannel.h"
#include <utils/Looper.h>


// Only queue this number of packets by tag type. Packets are simply dropped
// if the queue is full, so these numbers should be calibrated such that
// there's a ~0% chance of packet loss during normal operation.  Normally the
// |capture| clients should be pulling all packets out of the data socket in
// well under 1 second.
static const int MaxPacketQueueByTag[__MAX_TAG] = {
  10, // TAG_MP4: 10 seconds of recorded video
  30, // TAG_FACES: 30 face events (10 events/second is not uncommon)
  20, // TAG_PCM: 2 seconds of PCM data for audio analysis (~10 audio tags/second)
  1,  // TAG_H264_IDR: only need one h264 idr frame
  12, // TAG_H264: ~0.5 seconds of h264 delta frames at 24fps
};


SocketChannel::SocketChannel(const char *socketName)
  : SocketListener1(socketName, true),
    mPacketQueueByTag() {

  mTransmitLooper = new Looper(0);
  pthread_create(&mTransmitThread, nullptr, startTransmitThread, this);
}

SocketChannel::~SocketChannel() {
}

void *SocketChannel::startTransmitThread(void *arg) {
  SocketChannel *that = static_cast<SocketChannel *>(arg);
  that->transmitThread();
  return nullptr;
}

void SocketChannel::transmitThread() {
  Looper::setForThread(mTransmitLooper);

  QueuedPacket *packet = nullptr;
  for (;;) {
    {
      Mutex::Autolock autoLock(mPacketQueueLock);

      if (!mPacketQueue.empty()) {
        List<QueuedPacket *>::iterator i = mPacketQueue.begin();
        packet = *i;
        mPacketQueue.erase(i);
        --mPacketQueueByTag[packet->tag];
      }
    }

    if (packet == nullptr) {
      // The packet queue is empty. Wait until |wake()| is called after a new
      // packet is enqueued.
      int event = mTransmitLooper->pollOnce(-1);
      if (event != Looper::POLL_WAKE) {
        ALOGE("Unexpected event: %d", event);
      }
    } else {
      ALOGV(
        "xmit tag:%d, size: %d, when:%ld.%ld durationMs:%d\n",
        packet->tag,
        packet->size,
        packet->when.tv_sec,
        packet->when.tv_usec,
        packet->durationMs
      );
      if (isSocketAvailable()) {
        PacketHeader header = {
          packet->size,
          packet->tag,
          packet->when,
          packet->durationMs
        };
        sendData(&header, sizeof(header));
        if (packet->size > 0) {
          sendData(packet->data, packet->size);
        }
      } else {
        ALOGV("socket not available; packet dropped");
      }
      delete packet;
      packet = nullptr;
    }
  }
}

/**
 *
 */
void SocketChannel::send(
  Tag tag,
  timeval &when,
  int32_t durationMs,
  const void *data,
  size_t size,
  FreeDataFunc freeDataFunc,
  void *freeData
) {
  QueuedPacket *packet = new QueuedPacket(
    tag,
    when,
    durationMs,
    data,
    size,
    freeDataFunc,
    freeData
  );
  bool drop = true;

  {
    Mutex::Autolock autoLock(mPacketQueueLock);

    if (mPacketQueueByTag[tag] < MaxPacketQueueByTag[tag]) {
      mPacketQueue.push_back(packet);
      ++mPacketQueueByTag[tag];
      drop = false;
    }
  }

  ALOGV(
    "queuing tag:%d, size: %d, when:%ld.%ld durationMs:%d\n",
    tag,
    size,
    when.tv_sec,
    when.tv_usec,
    durationMs
  );
  if (drop) {
    ALOGE(
      "Packet queue full for tag: %d (%d/%d), dropping...",
      tag,
      mPacketQueueByTag[tag],
      MaxPacketQueueByTag[tag]
    );
    delete packet;
  } else {
    mTransmitLooper->wake();
  }
}

