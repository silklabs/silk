/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#define LOG_TAG "silk-vad-native"
#ifdef ANDROID
//#define LOG_NDEBUG 0
#include <utils/Log.h>
#else
#define ALOGV(fmt, args...) fprintf(stderr, LOG_TAG ": " fmt, ##args); fprintf(stderr, "\n");
#define ALOGE ALOGV
#define ALOGD ALOGV
#endif

#include <string.h>
#include "vad.h"

/**
 *
 */
Vad::Vad() :
  frameOffset(0) {
  vadInst = WebRtcVad_Create();
  ALOGV("Instantiating webrtc vad");
}

/**
 *
 */
Vad::~Vad() {
  WebRtcVad_Free(vadInst);
}

/**
 * Set sample rate and frame length
 */
int Vad::SetSampleRate(int rate) {
  ALOGV("Setting sample rate to: %d", rate);
  sampleRate = rate;
  frameLength = CALC_FRAME_SIZE(MAX_FRAME_LENGTH, rate);
  return !(rate == 8000 || rate == 16000 || rate == 32000 || rate == 48000);
}

/**
 * Process incoming audio sample in frames of size {@code frameLength} as
 * webrtc can not process audio bigger than 30ms worth of data for a given
 * sample rate
 */
vad_event Vad::ProcessAudio(const int16_t* samples, int num_samples) {
  int histogram[EVENT_COUNT] = {0};
  vad_sample_iterator it;

  VadFrameBegin(&it, samples, num_samples);
  while (VadFrameNext(&it)) {
    int event = WebRtcVad_Process(vadInst, sampleRate, it.buf, it.inc);
    ALOGV("vadProcessAudio event = %s", NAME(event + 1));
    ++histogram[EVENT_OFFSET(event)];
  }
  VadFrameEnd(&it);

  return VadDecision(histogram);
}

/**
 * Start frame analysis
 */
void Vad::VadFrameBegin(vad_sample_iterator* it, const int16_t* samples,
                        size_t num_samples) {
  it->buf = frame;
  it->inc = frameLength;
  it->len = num_samples;
  it->ptr = samples;
  it->ofs = frameOffset;
  ALOGV("Processing audio with length: %d, frameLength: %d frameOffset: %d", num_samples,
        frameLength, frameOffset);
}

/**
 * Fetch next frame
 */
int Vad::VadFrameNext(vad_sample_iterator* it) {
  size_t i, fill;

  if (it->len == 0) {
    return 0;
  }

  for (i = 0, fill = it->inc - it->ofs; i < fill && it->len > 0; ++i, --it->len) {
    it->buf[it->ofs++] = *it->ptr++;
  }

  if (it->ofs >= it->inc) {
    it->ofs = 0;
    return 1;
  }
  return 0;
}

/**
 * End frame analysis
 */
void Vad::VadFrameEnd(vad_sample_iterator* it) {
  ALOGV("vadFrameEnd overhang = %d samples", (int)it->ofs);
  frameOffset = it->ofs;
}

/**
 * Make a final decision on event type to emit for the entire audio buffer
 * provided for processing
 */
vad_event Vad::VadDecision(const int* histogram) {
  int i, sum;

  for (i = 0, sum = 0; i < EVENT_COUNT; ++i) {
    sum += histogram[i];
  }

  // Not enough data - default to silence
  if (sum == 0) {
    return VAD_EVENT_SILENCE;
  }

  // Something went wrong along the way
  if (SELECT_EVENT(VAD_EVENT_ERROR, histogram) > 0) {
    return VAD_EVENT_ERROR;
  }

  // Even if there is one voice event consider it as the final verdict
  if (SELECT_EVENT(VAD_EVENT_VOICE, histogram) > 0) {
    return VAD_EVENT_VOICE;
  }

  return VAD_EVENT_SILENCE;
}
