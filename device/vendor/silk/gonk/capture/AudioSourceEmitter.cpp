/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
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

// TODO: This hard code must match ext/clapper
#define FFT_WINDOW_SIZE 256    // 32ms - units of samples

// Batch this number of audio sample windows before sending off to node. Else,
// we'd be flooding node with data every 20ms, which incurs lots o overhead.
#define WINDOWS_PER_PACKET 6 // 192ms of data per TAG_MIC packet

// AudioSource is always 16 bit PCM (2 bytes / sample)
#define BYTES_PER_SAMPLE 2

using namespace android;

AudioSourceEmitter::AudioSourceEmitter(Channel* channel, const sp<MediaSource> &source) :
    mChannel(channel),
    mSource(source) {
  CHECK(sAudioSampleRate == 8000); // Hardcoded assumption that must match ext/clapper extension
  mAudioBufferIdx = 0;

  mAudioBufferLen = FFT_WINDOW_SIZE * BYTES_PER_SAMPLE *
      WINDOWS_PER_PACKET * sAudioChannels;
  mAudioBuffer = nullptr;

  mNextTime.tv_sec = mNextTime.tv_usec = 0;
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

// Reading audio buffers can be delayed, so we cannot rely on gettimeofday
// for the timetamp of the audio buffer. Audio buffers are a consistent stream
// of samples with no discontinuities. So instead, calculate the next timestamp
// based on the prior time, plus the duration of the samples.

void AudioSourceEmitter::getTime(timeval *when) {
  // First time called, use gettimeofday
  if (mNextTime.tv_sec == 0 && mNextTime.tv_usec == 0) {
    gettimeofday(&mNextTime, NULL);
  }

  // The time can change on us. Buffers should never be delayed by more than
  // a few 100s milliseconds. To keep the math simple, if the current time is
  // roughly off by more than 5 seconds, consider this a time change, and
  // use the current time instead.
  timeval now;
  gettimeofday(&now, NULL);

  // We just need a rough delta, ignore tv_usec.
  int32_t deltaSec = now.tv_sec - mNextTime.tv_sec;
  if (abs(deltaSec) > 5) {
    mNextTime = now;
  }

  *when = mNextTime;
}

void AudioSourceEmitter::updateNextTime(uint32_t numBytes) {
  // Update the next time by the number of samples receied.
  uint32_t numSamples = numBytes / BYTES_PER_SAMPLE / sAudioChannels;
  uint64_t usec = numSamples * 1000 * 1000 / sAudioSampleRate;
  uint64_t sec;

  usec = mNextTime.tv_usec + usec;
  sec = mNextTime.tv_sec + (usec / 1000 / 1000);

  mNextTime.tv_sec = (time_t) sec;
  mNextTime.tv_usec = (suseconds_t) usec;
}

status_t AudioSourceEmitter::read(MediaBuffer **buffer,
    const ReadOptions *options) {
  status_t err = mSource->read(buffer, options);

  if (err == ::OK && (*buffer) && (*buffer)->range_length()) {
    uint8_t *data = static_cast<uint8_t *>((*buffer)->data()) + (*buffer)->range_offset();
    uint32_t len = (*buffer)->range_length();

    // If these next samples will overrun the buffer, then send out data now
    if (mAudioBufferIdx + len > mAudioBufferLen) {
      uint32_t fillLen = mAudioBufferLen - mAudioBufferIdx;
      if (fillLen > 0) {
        // Top off the buffer to ensure that the packet is evenly divisible by
        // the fft window size (mAudioBufferLen)
        memcpy(mAudioBuffer + mAudioBufferIdx, data, fillLen);
        data += fillLen;
        len -= fillLen;
      }

      timeval when;
      getTime(&when);
      mChannel->send(Channel::TAG_MIC, when, 0, mAudioBuffer, mAudioBufferLen,
          free, mAudioBuffer);
      updateNextTime(mAudioBufferLen);
      mAudioBuffer = nullptr;
      mAudioBufferIdx = 0;
    }

    // let's assume we will never get a set samples larger than our full buffer
    CHECK(mAudioBufferIdx + len <= mAudioBufferLen);

    // batch samples
    if (mAudioBuffer == nullptr) {
      mAudioBuffer = (uint8_t *) malloc(mAudioBufferLen);
      CHECK(mAudioBuffer != nullptr);
    }
    memcpy(mAudioBuffer + mAudioBufferIdx, data, len);
    mAudioBufferIdx += len;
 }

  return err;
}

