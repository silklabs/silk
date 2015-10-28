/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture"
#include <utils/Log.h>

#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/MetaData.h>
#include <media/stagefright/AudioSource.h>

#include "AudioSourceEmitter.h"
#include "Channel.h"

// Batch this amount of audio samples before sending off to node. Else, we'd
// be flooding node with data every 20ms, which incurs lots o overhead.
#define AUDIO_BUFFER_MS 200

using namespace android;

AudioSourceEmitter::AudioSourceEmitter(Channel* channel, const sp<MediaSource> &source) :
    mChannel(channel),
    mSource(source) {
  mAudioBufferIdx = 0;
  // AudioSource is always 16 bit PCM (2 bytes / sample)
  mAudioBufferLen = sAudioSampleRate * AUDIO_BUFFER_MS / 1000 * 2;
  mAudioBuffer = nullptr;
}

AudioSourceEmitter::~AudioSourceEmitter() {
  free(mAudioBuffer);
}

status_t AudioSourceEmitter::start(MetaData *params) {
  return mSource->start(params);
}

status_t AudioSourceEmitter::stop() {
  return mSource->stop();
}

sp<MetaData> AudioSourceEmitter::getFormat() {
  return mSource->getFormat();
}

status_t AudioSourceEmitter::read(MediaBuffer **buffer,
    const ReadOptions *options) {
  status_t err = mSource->read(buffer, options);

  if (err == ::OK && (*buffer) && (*buffer)->range_length()) {
    uint32_t len = (*buffer)->range_length();

    // If these next samples will overrun the buffer, then send out data now
    if (mAudioBufferIdx + len >= mAudioBufferLen) {
      mChannel->send(Channel::TAG_MIC, mAudioBuffer, mAudioBufferIdx, free, mAudioBuffer);
      mAudioBuffer = nullptr;
      mAudioBufferIdx = 0;
    }

    // let's assume we will never get a set samples larger than our full buffer
    CHECK(mAudioBufferIdx + len < mAudioBufferLen);

    // batch samples
    if (mAudioBuffer == nullptr) {
      mAudioBuffer = (uint8_t *) malloc(mAudioBufferLen);
      CHECK(mAudioBuffer != nullptr);
    }
    memcpy(mAudioBuffer + mAudioBufferIdx,
        (const uint8_t *) (*buffer)->data() + (*buffer)->range_offset(), len);
    mAudioBufferIdx += len;
 }

  return err;
}

