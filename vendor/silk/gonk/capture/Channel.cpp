/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-Channel"
#include <utils/Log.h>

#include "Channel.h"
#include <sys/time.h>
#include <utils/Looper.h>


// Only queue this number of packets by tag type. Packets are simply dropped
// if the queue is full, so these numbers should be calibrated such that
// there's a ~0% chance of packet loss during normal operation (especially
// TAG_VIDEO).  Normally the |capture| client should be pulling all packets
// out of the data socket in well under 1 second.
static const int MaxPacketQueueByTag[Channel::__MAX_TAG] = {
  10, // TAG_VIDEO: 10 seconds of recorded video
  30, // TAG_FACES: 30 face events (10 events/second is not uncommon)
  20, // TAG_MIC: 4 seconds of PCM data for audio analysis (~5 audio tags/second)
};


Channel::Channel()
  : SocketListener1(CAPTURE_DATA_SOCKET_NAME, true),
    mPacketQueueByTag() {

  mTransmitLooper = new Looper(0);
  pthread_create(&mTransmitThread, nullptr, startTransmitThread, this);
}

Channel::~Channel() {
}

void *Channel::startTransmitThread(void *arg) {
  Channel *that = static_cast<Channel *>(arg);
  that->transmitThread();
  return nullptr;
}

void Channel::transmitThread() {
  Looper::setForThread(mTransmitLooper);

  while (mTransmitLooper->pollOnce(-1)) {
    QueuedPacket *packet = nullptr;

    {
      Mutex::Autolock autoLock(mPacketQueueLock);
      if (!mPacketQueue.empty()) {
        List<QueuedPacket *>::iterator i = mPacketQueue.begin();
        packet = *i;
        mPacketQueue.erase(i);
      }
    }

    if (packet == nullptr) {
      continue;
    }

    ALOGV("xmit tag:%d, size: %d, when:%ld.%ld durationMs:%d\n",
          packet->tag, packet->size, packet->when.tv_sec, packet->when.tv_usec,
          packet->durationMs);
    if (isSocketAvailable()) {
      Header header = { packet->size, packet->tag, packet->when, packet->durationMs };
      sendData(&header, sizeof(header));
      if (packet->size > 0) {
        sendData(packet->data, packet->size);
      }
    } else {
      ALOGV("Socket not available; packet dropped");
    }

    {
      Mutex::Autolock autoLock(mPacketQueueLock);
      --mPacketQueueByTag[packet->tag];
    }
    delete packet;
  }
}

/**
 *
 */
void Channel::send(Tag tag, timeval &when, int32_t durationMs,
                   const void *data, size_t size,
                   FreeDataFunc freeDataFunc, void *freeData) {
  ALOGV("queuing tag:%d, size: %d, when:%ld.%ld durationMs:%d\n",
        tag, size, when.tv_sec, when.tv_usec, durationMs);

  {
    Mutex::Autolock autoLock(mPacketQueueLock);
    bool drop = false;
    QueuedPacket *packet = new QueuedPacket(tag, when, durationMs, data, size, freeDataFunc, freeData);

    if (mPacketQueueByTag[tag] >= MaxPacketQueueByTag[tag]) {
      ALOGE("Packet queue full for tag: %d (%d/%d), dropping...",
        tag, mPacketQueueByTag[tag], MaxPacketQueueByTag[tag]);
      delete packet;
      return;
    }
    mPacketQueue.push_back(packet);
    ++mPacketQueueByTag[tag];
    mTransmitLooper->wake();
  }
}

/**
 *
 */
void Channel::send(Tag tag, const void *data, size_t size,
                   FreeDataFunc freeDataFunc, void *freeData) {
  timeval when;
  gettimeofday(&when, NULL);
  send(tag, when, 0, data, size, freeDataFunc, freeData);
}
