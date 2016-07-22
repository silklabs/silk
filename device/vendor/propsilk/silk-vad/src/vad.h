/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#ifndef VAD_H
#define VAD_H

#include <stddef.h>
#include <nan.h>
#include <string.h>
#include "vad/include/webrtc_vad.h"

/* VAD event types */
typedef enum _vad_event {
  VAD_EVENT_ERROR = -1, // Processing error occurred
  VAD_EVENT_SILENCE = 0, // Silence detected
  VAD_EVENT_VOICE = 1, // Voice detected
} vad_event;

/* Calculate the number of samples for an audio frame */
#define CALC_FRAME_SIZE(duration, rate) (((rate) / 1000) * (duration))
/* Max. supported sample rate in Hz */
#define MAX_SAMPLERATE                  48000
/* Max. supported frame length in ms */
#define MAX_FRAME_LENGTH                30
/* Max. possible buffer length */
#define MAX_BUFFER_SIZE                 CALC_FRAME_SIZE(MAX_FRAME_LENGTH, MAX_SAMPLERATE)
/* Number of events per call */
#define EVENT_BUFFER_SIZE               16
/* Number of unique event types */
#define EVENT_COUNT                     4
/* Map event code to offset */
#define EVENT_OFFSET(event)             ((event) + 1)
/* Select an event from a histogram */
#define SELECT_EVENT(event, histogram)  ((histogram)[EVENT_OFFSET(event)])

static const char* event_names[3] = { "ERROR", "SILENCE", "VOICE" };
#define NAME(event) event_names[event]

/* Sample iterator */
typedef struct _vad_sample_iterator {
  int16_t* buf; // Frame buffer
  const int16_t* ptr; // Input samples
  size_t ofs; // Offset into frame buffer
  size_t len; // Number of input samples
  size_t inc; // Frame increment in samples
} vad_sample_iterator;

/**
 * This class is a wrapper around webrtc_vad
 */
class Vad : public Nan::ObjectWrap {
public:
  static void Init(v8::Local<v8::Object> exports);
  vad_event ProcessAudio(const int16_t* samples, int num_samples);
  int SetSampleRate(int rate);

private:
  explicit Vad();
  ~Vad();
  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;

  void VadFrameBegin(vad_sample_iterator* it, const int16_t* samples, size_t num_samples);
  int VadFrameNext(vad_sample_iterator* it);
  void VadFrameEnd(vad_sample_iterator* it);
  vad_event VadDecision(const int* histogram);

  static NAN_METHOD(Init);
  static NAN_METHOD(SetMode);
  static NAN_METHOD(ProcessAudio);

  VadInst* vadInst; // Handle of the VAD implementation
  int sampleRate;
  int16_t frame[MAX_BUFFER_SIZE]; // Ring buffer for full frames
  int frameLength; // Length of a full frame for the given sample rate
  int frameOffset; // Current frame offset
};

#endif
