/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *  Copyright (c) 2016 Silk Labs, Inc. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#include <stdint.h>
#include <stdlib.h>
#include <linux/binder.h>

#include "audio_device_gonk.h"

#include <android/log.h>

#include "webrtc/base/arraysize.h"
#include "webrtc/base/format_macros.h"
#include "webrtc/base/timeutils.h"
#include "webrtc/modules/audio_device/fine_audio_buffer.h"

#define TAG "AudioDeviceGonk"
#define ALOGV(...) __android_log_print(ANDROID_LOG_VERBOSE, TAG, __VA_ARGS__)
#define ALOGD(...) __android_log_print(ANDROID_LOG_DEBUG, TAG, __VA_ARGS__)
#define ALOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define ALOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)
#define ALOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

#define RETURN_ON_ERROR(op, ...)        \
  do {                                  \
    SLresult err = (op);                \
    if (err != SL_RESULT_SUCCESS) {     \
      ALOGE("%s failed: %d", #op, err); \
      return __VA_ARGS__;               \
    }                                   \
  } while (0)

namespace webrtc {

const int kLowLatencyModeDelayEstimateInMilliseconds = 50;

AudioDeviceGonk::AudioDeviceGonk()
  // TODO: get the real sample rate and number of frames per buffer
  // needed to kick on low-latency playback.
    : audio_parameters_(16000, 1, 512),
      audio_device_buffer_(NULL),
      playback_initialized_(false),
      playing_(false),
      bytes_per_buffer_(0),
      buffer_index_(0),
      engine_(nullptr),
      player_(nullptr),
      simple_buffer_queue_(nullptr),
      volume_(nullptr),
      last_play_time_(0),
      recording_initialized_(false),
      recording_(false),
      recorder_object_(nullptr),
      recorder_(nullptr),
      recorder_buffer_queue_(nullptr)
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  pcm_format_ = CreatePCMConfiguration(audio_parameters_.channels(),
                                       audio_parameters_.sample_rate(),
                                       audio_parameters_.bits_per_sample());
  // Detach from this thread since we want to use the checker to verify calls
  // from the internal  audio thread.
  thread_checker_opensles_.DetachFromThread();
}

AudioDeviceGonk::~AudioDeviceGonk()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  RTC_DCHECK(thread_checker_.CalledOnValidThread());

  Terminate();
  DestroyAudioPlayer();
  DestroyMix();
  DestroyEngine();

  RTC_DCHECK(!engine_object_.Get());
  RTC_DCHECK(!engine_);
  RTC_DCHECK(!output_mix_.Get());
  RTC_DCHECK(!player_);
  RTC_DCHECK(!simple_buffer_queue_);
  RTC_DCHECK(!volume_);
}

int32_t
AudioDeviceGonk::ActiveAudioLayer(AudioDeviceModule::AudioLayer& audioLayer) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::Init()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  RTC_DCHECK(thread_checker_.CalledOnValidThread());

  CreateEngine();

  return 0;
}

int32_t
AudioDeviceGonk::Terminate()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  RTC_DCHECK(thread_checker_.CalledOnValidThread());

  StopPlayout();
  return 0;
}

bool
AudioDeviceGonk::Initialized() const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return false;
}

int16_t
AudioDeviceGonk::PlayoutDevices()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return 1;
}

int16_t
AudioDeviceGonk::RecordingDevices()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return 1;
}

int32_t
AudioDeviceGonk::PlayoutDeviceName(uint16_t index,
                                   char name[kAdmMaxDeviceNameSize],
                                   char guid[kAdmMaxGuidSize])
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}


int32_t
AudioDeviceGonk::RecordingDeviceName(uint16_t index,
                                     char name[kAdmMaxDeviceNameSize],
                                     char guid[kAdmMaxGuidSize])
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::SetPlayoutDevice(uint16_t index)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return 0;
}

int32_t
AudioDeviceGonk::SetPlayoutDevice(AudioDeviceModule::WindowsDeviceType device)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::SetRecordingDevice(uint16_t index)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return 0;
}

int32_t
AudioDeviceGonk::SetRecordingDevice(AudioDeviceModule::WindowsDeviceType device)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::PlayoutIsAvailable(bool& available)
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  available = true;
  return 0;
}

int32_t
AudioDeviceGonk::InitPlayout()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  RTC_DCHECK(thread_checker_.CalledOnValidThread());
  RTC_DCHECK(!playback_initialized_);
  RTC_DCHECK(!playing_);

  CreateMix();
  playback_initialized_ = true;
  buffer_index_ = 0;
  last_play_time_ = rtc::Time();
  return 0;
}

bool
AudioDeviceGonk::PlayoutIsInitialized() const
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  return playback_initialized_;
}

int32_t
AudioDeviceGonk::RecordingIsAvailable(bool& available)
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  available = true;
  return 0;
}

static void
RecorderCallback(SLAndroidSimpleBufferQueueItf bq, void* context)
{
  ALOGI("RECORDER CALLBACK %p", context);
}

int32_t
AudioDeviceGonk::InitRecording()
{
  ALOGI("%s(%p)", __FUNCTION__, this);


  printf(" rtc  frames per 10ms = %d\n", audio_parameters_.frames_per_10ms_buffer());
  

  if (recording_initialized_) {
    return 0;
  }

  recording_initialized_ = true;

  SLresult result;

  // configure audio source
  SLDataLocator_IODevice loc_dev = {
    SL_DATALOCATOR_IODEVICE, SL_IODEVICE_AUDIOINPUT,
    SL_DEFAULTDEVICEID_AUDIOINPUT, NULL
  };
  SLDataSource audioSrc = {&loc_dev, NULL};

  // configure audio sink
  SLDataLocator_AndroidSimpleBufferQueue loc_bq = {
    SL_DATALOCATOR_ANDROIDSIMPLEBUFFERQUEUE,
    static_cast<SLuint32>(kNumOfOpenSLESBuffers)
  };
  SLDataSink audioSnk = { &loc_bq, &pcm_format_ };

  // create audio recorder
  // (requires the RECORD_AUDIO permission)
  const SLInterfaceID id[1] = {SL_IID_ANDROIDSIMPLEBUFFERQUEUE};
  const SLboolean req[1] = {SL_BOOLEAN_TRUE};
  result = (*engine_)->CreateAudioRecorder(engine_, &recorder_object_,
                                           &audioSrc, &audioSnk,
                                           1, id, req);
  if (SL_RESULT_SUCCESS != result) {
    ALOGE("Failed to create recorder: %d", result);
    return -1;
  }

  // realize the audio recorder
  result = (*recorder_object_)->Realize(recorder_object_, SL_BOOLEAN_FALSE);
  if (SL_RESULT_SUCCESS != result) {
    ALOGE("Failed to realize recorder: %d", result);
    return -1;
  }

  // get the record interface
  result = (*recorder_object_)->GetInterface(recorder_object_, SL_IID_RECORD,
                                             &recorder_);
  assert(SL_RESULT_SUCCESS == result);

  // get the buffer queue interface
  result = (*recorder_object_)->GetInterface(recorder_object_, SL_IID_ANDROIDSIMPLEBUFFERQUEUE,
                                           &recorder_buffer_queue_);
  assert(SL_RESULT_SUCCESS == result);

  // register callback on the buffer queue
  result = (*recorder_buffer_queue_)->RegisterCallback(recorder_buffer_queue_,
                                                       RecorderCallback, this);
  assert(SL_RESULT_SUCCESS == result);

  const size_t buffer_size =
    audio_parameters_.frames_per_10ms_buffer() * sizeof(int16_t);
  ALOGD("recorder buffer size: %" PRIuS, buffer_size);
  for (int i = 0; i < kNumOfOpenSLESBuffers; ++i) {
    recorder_buffers_[i].reset(new SLint8[buffer_size]);
  }

  return 0;
}

bool
AudioDeviceGonk::RecordingIsInitialized() const
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  
  return -1;
}

int32_t
AudioDeviceGonk::StartPlayout()
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  RTC_DCHECK(thread_checker_.CalledOnValidThread());
  RTC_DCHECK(playback_initialized_);
  RTC_DCHECK(!playing_);
  // The number of lower latency audio players is limited, hence we create the
  // audio player in Start() and destroy it in Stop().
  CreateAudioPlayer();
  // Fill up audio buffers to avoid initial glitch and to ensure that playback
  // starts when mode is later changed to SL_PLAYSTATE_PLAYING.
  // TODO(henrika): we can save some delay by only making one call to
  // EnqueuePlayoutData. Most likely not worth the risk of adding a glitch.
  for (int i = 0; i < kNumOfOpenSLESBuffers; ++i) {
    EnqueuePlayoutData();
  }
  // Start streaming data by setting the play state to SL_PLAYSTATE_PLAYING.
  // For a player object, when the object is in the SL_PLAYSTATE_PLAYING
  // state, adding buffers will implicitly start playback.
  RETURN_ON_ERROR((*player_)->SetPlayState(player_, SL_PLAYSTATE_PLAYING), -1);

  playing_ = (GetPlayState() == SL_PLAYSTATE_PLAYING);
  RTC_DCHECK(playing_);
  return 0;
}

int32_t
AudioDeviceGonk::StopPlayout()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  RTC_DCHECK(thread_checker_.CalledOnValidThread());

  if (!playback_initialized_ || !playing_) {
    return 0;
  }
  // Stop playing by setting the play state to SL_PLAYSTATE_STOPPED.
  RETURN_ON_ERROR((*player_)->SetPlayState(player_, SL_PLAYSTATE_STOPPED), -1);
  // Clear the buffer queue to flush out any remaining data.
  RETURN_ON_ERROR((*simple_buffer_queue_)->Clear(simple_buffer_queue_), -1);
#ifndef NDEBUG
  // Verify that the buffer queue is in fact cleared as it should.
  SLAndroidSimpleBufferQueueState buffer_queue_state;
  (*simple_buffer_queue_)->GetState(simple_buffer_queue_, &buffer_queue_state);
  RTC_DCHECK_EQ(0u, buffer_queue_state.count);
  RTC_DCHECK_EQ(0u, buffer_queue_state.index);
#endif
  // The number of lower latency audio players is limited, hence we create the
  // audio player in Start() and destroy it in Stop().
  DestroyAudioPlayer();
  thread_checker_opensles_.DetachFromThread();
  playback_initialized_ = false;
  playing_ = false;
  return 0;
}

bool
AudioDeviceGonk::Playing() const
{  SLresult result;
  ALOGI("%s(%p)", __FUNCTION__, this);

  return playing_;
}

int32_t
AudioDeviceGonk::StartRecording()
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  if (!recording_initialized_) {
    ALOGE("Recording not initialized");
    return -1;
  }
  if (recording_) {
    ALOGI("Already recording");
    return 0;
  }

  recording_ = true;

  SLresult result;
  const size_t buffer_size =
    audio_parameters_.frames_per_10ms_buffer() * sizeof(int16_t);
  for (int i = 0; i < kNumOfOpenSLESBuffers; ++i) {
    result = (*recorder_buffer_queue_)->Enqueue(recorder_buffer_queue_,
                                                recorder_buffers_[i].get(),
                                                buffer_size);
    assert(SL_RESULT_SUCCESS == result);
    // the most likely other result is SL_RESULT_BUFFER_INSUFFICIENT,
    // which for this code example would indicate a programming error
  }

  // start recording
  result = (*recorder_)->SetRecordState(recorder_, SL_RECORDSTATE_RECORDING);
  assert(SL_RESULT_SUCCESS == result);
  ALOGI("Set recording state to RECORDING");

  return 0;
}

int32_t
AudioDeviceGonk::StopRecording()
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  if (!recording_) {
    return 0;
  }

  recording_ = false;

  SLresult result;

  result = (*recorder_)->SetRecordState(recorder_, SL_RECORDSTATE_STOPPED);
  assert(SL_RESULT_SUCCESS == result);

  result = (*recorder_buffer_queue_)->Clear(recorder_buffer_queue_);
  assert(SL_RESULT_SUCCESS == result);

  return 0;
}

bool
AudioDeviceGonk::Recording() const
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  return recording_;
}

int32_t
AudioDeviceGonk::SetAGC(bool enable)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

bool
AudioDeviceGonk::AGC() const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return false;
}

int32_t
AudioDeviceGonk::SetWaveOutVolume(uint16_t volumeLeft,
                                  uint16_t volumeRight)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::WaveOutVolume(uint16_t& volumeLeft,
                               uint16_t& volumeRight) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::InitSpeaker()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

bool
AudioDeviceGonk::SpeakerIsInitialized() const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return false;
}

int32_t
AudioDeviceGonk::InitMicrophone()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

bool
AudioDeviceGonk::MicrophoneIsInitialized() const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return false;
}

int32_t
AudioDeviceGonk::SpeakerVolumeIsAvailable(bool& available)
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  available = false;
  return 0;
}

int32_t
AudioDeviceGonk::SetSpeakerVolume(uint32_t volume)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::SpeakerVolume(uint32_t& volume) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::MaxSpeakerVolume(uint32_t& maxVolume) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::MinSpeakerVolume(uint32_t& minVolume) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::SpeakerVolumeStepSize(uint16_t& stepSize) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::MicrophoneVolumeIsAvailable(bool& available)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::SetMicrophoneVolume(uint32_t volume)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::MicrophoneVolume(uint32_t& volume) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::MaxMicrophoneVolume(uint32_t& maxVolume) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::MinMicrophoneVolume(uint32_t& minVolume) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::MicrophoneVolumeStepSize(uint16_t& stepSize) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::SpeakerMuteIsAvailable(bool& available)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::SetSpeakerMute(bool enable)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::SpeakerMute(bool& enabled) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::MicrophoneMuteIsAvailable(bool& available)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::SetMicrophoneMute(bool enable)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::MicrophoneMute(bool& enabled) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::MicrophoneBoostIsAvailable(bool& available)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::SetMicrophoneBoost(bool enable)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::MicrophoneBoost(bool& enabled) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::StereoPlayoutIsAvailable(bool& available)
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  available = false;
  return 0;
}

int32_t
AudioDeviceGonk::SetStereoPlayout(bool enable)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::StereoPlayout(bool& enabled) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::StereoRecordingIsAvailable(bool& available)
{
  ALOGI("%s(%p)", __FUNCTION__, this);

  available = false;
  return 0;
}

int32_t
AudioDeviceGonk::SetStereoRecording(bool enable)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::StereoRecording(bool& enabled) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::SetPlayoutBuffer(const AudioDeviceModule::BufferType type,
                                  uint16_t sizeMS)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::PlayoutBuffer(AudioDeviceModule::BufferType& type,
                               uint16_t& sizeMS) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::PlayoutDelay(uint16_t& delayMS) const
{
  //ALOGV("%s", __FUNCTION__);

  // TODO: this is overly optimistic, need to figure out whether we're
  // on the low-latency or high-latency playback pipeline.
  delayMS = kLowLatencyModeDelayEstimateInMilliseconds / 2;
  return 0;
}

int32_t
AudioDeviceGonk::RecordingDelay(uint16_t& delayMS) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

int32_t
AudioDeviceGonk::CPULoad(uint16_t& load) const
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  return -1;
}

bool
AudioDeviceGonk::PlayoutWarning() const
{
  //ALOGV("%s", __FUNCTION__);
  return false;
}

bool
AudioDeviceGonk::PlayoutError() const
{
  //ALOGV("%s", __FUNCTION__);
  return false;
}

bool
AudioDeviceGonk::RecordingWarning() const
{
  //ALOGV("%s", __FUNCTION__);
  return false;
}

bool
AudioDeviceGonk::RecordingError() const
{
  //ALOGV("%s", __FUNCTION__);
  return false;
}

void
AudioDeviceGonk::ClearPlayoutWarning()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
}

void
AudioDeviceGonk::ClearPlayoutError()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
}

void
AudioDeviceGonk::ClearRecordingWarning()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
}

void
AudioDeviceGonk::ClearRecordingError()
{
  ALOGI("%s(%p)", __FUNCTION__, this);
}

void
AudioDeviceGonk::AttachAudioBuffer(AudioDeviceBuffer* audioBuffer)
{
  ALOGI("%s(%p)", __FUNCTION__, this);
  RTC_DCHECK(thread_checker_.CalledOnValidThread());
  audio_device_buffer_ = audioBuffer;
  const int sample_rate_hz = audio_parameters_.sample_rate();
  ALOGD("SetPlayoutSampleRate(%d)", sample_rate_hz);
  audio_device_buffer_->SetPlayoutSampleRate(sample_rate_hz);
  const size_t channels = audio_parameters_.channels();
  ALOGD("SetPlayoutChannels(%" PRIuS ")", channels);
  audio_device_buffer_->SetPlayoutChannels(channels);
  RTC_CHECK(audio_device_buffer_);
  AllocateDataBuffers();
}

// static
void AudioDeviceGonk::SimpleBufferQueueCallback(
    SLAndroidSimpleBufferQueueItf caller,
    void* context) {
  //ALOGV("%s", __FUNCTION__);
  AudioDeviceGonk* stream = reinterpret_cast<AudioDeviceGonk*>(context);
  stream->FillBufferQueue();
}

void AudioDeviceGonk::FillBufferQueue() {
  RTC_DCHECK(thread_checker_opensles_.CalledOnValidThread());
  SLuint32 state = GetPlayState();
  if (state != SL_PLAYSTATE_PLAYING) {
    ALOGW("Buffer callback in non-playing state!");
    return;
  }
  EnqueuePlayoutData();
}

const int16_t samples_1khz_sine[] = {
  0,
  1530,
  2828,
  3695,
  4000,
  3695,
  2828,
  1530,
  0,
  -153,0
  -2828,
  -3695,
  -4000,
  -3695,
  -2828,
  -1530,
};

void AudioDeviceGonk::EnqueuePlayoutData() {
  // Check delta time between two successive callbacks and provide a warning
  // if it becomes very large.
  // TODO(henrika): using 100ms as upper limit but this value is rather random.
  const uint32_t current_time = rtc::Time();
  const uint32_t diff = current_time - last_play_time_;
  if (last_play_time_ > 0 && diff > 100) {
    ALOGW("Bad OpenSL ES playout timing, dT=%u [ms]", diff);
  }
  last_play_time_ = current_time;
  // Read audio data from the WebRTC source using the FineAudioBuffer object
  // to adjust for differences in buffer size between WebRTC (10ms) and native
  // OpenSL ES.
  SLint8* audio_ptr = audio_buffers_[buffer_index_].get();
  fine_buffer_->GetPlayoutData(audio_ptr);
 

#if 0
  int samples_per_buffer = bytes_per_buffer_ / 2;
  static int calls = 0;
  static int nonsilenceCount;
  static int16_t last[16];
  static int lastIdx = 0;

  bool nonsilence = false;
  int16_t* samples = (int16_t*)audio_ptr;
  for (int i = 0; i < samples_per_buffer; ++i) {
    if (samples[i] != 0) {
      nonsilence = true;
      last[lastIdx] = samples[i];
      lastIdx = (lastIdx + 1) % 16;
    }
  }
  if (nonsilence) {
    nonsilenceCount++;
  }
  if (++calls < 100 || (calls % 100) == 0) {
    printf(" rtc  AudioDeviceGonk::%s(%p)[%d]: NONSILENCE %d; %d Hz %d channels\n", __FUNCTION__,
           this, calls, nonsilenceCount, audio_parameters_.sample_rate(),
           audio_parameters_.channels());
    printf(" rtc   last: {%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d}\n",
           last[0], last[1], last[2], last[3],
           last[4], last[5], last[6], last[7],
           last[8], last[9], last[10], last[11],
           last[12], last[13], last[14], last[15]);
    nonsilenceCount = 0;
    lastIdx = 0;
    memset(last, 0, sizeof(last));


#if 0
    IAndroidBufferQueue *thiz = (IAndroidBufferQueue *) simple_buffer_queue_;
    printf(" rtc  AudioDeviceGonk::%s(%p): ABQ { state: %d, numBuffers: %d }\n", __NAME__,
           this, thiz.mState, this.mNumBuffers);
#endif

  }
#endif
  


 // Enqueue the decoded audio buffer for playback.
  SLresult err =
      (*simple_buffer_queue_)
          ->Enqueue(simple_buffer_queue_, audio_ptr, bytes_per_buffer_);
  if (SL_RESULT_SUCCESS != err) {
    ALOGE("Enqueue failed: %d", err);
  }
  buffer_index_ = (buffer_index_ + 1) % kNumOfOpenSLESBuffers;
}

SLDataFormat_PCM AudioDeviceGonk::CreatePCMConfiguration(
    size_t channels,
    int sample_rate,
    size_t bits_per_sample) {
  ALOGD("CreatePCMConfiguration");


  ALOGI("%s(%p): %d channels, %d sample_rate", __FUNCTION__,
        this, channels, sample_rate);


  RTC_CHECK_EQ(bits_per_sample, SL_PCMSAMPLEFORMAT_FIXED_16);
  SLDataFormat_PCM format;
  format.formatType = SL_DATAFORMAT_PCM;
  format.numChannels = static_cast<SLuint32>(channels);
  // Note that, the unit of sample rate is actually in milliHertz and not Hertz.
  switch (sample_rate) {
    case 8000:
      format.samplesPerSec = SL_SAMPLINGRATE_8;
      break;
    case 16000:
      format.samplesPerSec = SL_SAMPLINGRATE_16;
      break;
    case 22050:
      format.samplesPerSec = SL_SAMPLINGRATE_22_05;
      break;
    case 32000:
      format.samplesPerSec = SL_SAMPLINGRATE_32;
      break;
    case 44100:
      format.samplesPerSec = SL_SAMPLINGRATE_44_1;
      break;
    case 48000:
      format.samplesPerSec = SL_SAMPLINGRATE_48;
      break;
    default:
      RTC_CHECK(false) << "Unsupported sample rate: " << sample_rate;
  }
  format.bitsPerSample = SL_PCMSAMPLEFORMAT_FIXED_16;
  format.containerSize = SL_PCMSAMPLEFORMAT_FIXED_16;
  format.endianness = SL_BYTEORDER_LITTLEENDIAN;
  if (format.numChannels == 1)
    format.channelMask = SL_SPEAKER_FRONT_CENTER;
  else if (format.numChannels == 2)
    format.channelMask = SL_SPEAKER_FRONT_LEFT | SL_SPEAKER_FRONT_RIGHT;
  else
    RTC_CHECK(false) << "Unsupported number of channels: "
                     << format.numChannels;
  return format;
}

void AudioDeviceGonk::AllocateDataBuffers() {
  ALOGD("AllocateDataBuffers");
  RTC_DCHECK(thread_checker_.CalledOnValidThread());
  RTC_DCHECK(!simple_buffer_queue_);
  RTC_CHECK(audio_device_buffer_);
  // Don't use the lowest possible size as native buffer size. Instead,
  // use 10ms to better match the frame size that WebRTC uses. It will result
  // in a reduced risk for audio glitches and also in a more "clean" sequence
  // of callbacks from the OpenSL ES thread in to WebRTC when asking for audio
  // to render.
  ALOGD("lowest possible buffer size: %" PRIuS,
      audio_parameters_.GetBytesPerBuffer());
  bytes_per_buffer_ = audio_parameters_.GetBytesPerFrame() *
      audio_parameters_.frames_per_10ms_buffer();
  RTC_DCHECK_GE(bytes_per_buffer_, audio_parameters_.GetBytesPerBuffer());
  ALOGD("native buffer size: %" PRIuS, bytes_per_buffer_);
  // Create a modified audio buffer class which allows us to ask for any number
  // of samples (and not only multiple of 10ms) to match the native OpenSL ES
  // buffer size.
  fine_buffer_.reset(new FineAudioBuffer(audio_device_buffer_,
                                         bytes_per_buffer_,
                                         audio_parameters_.sample_rate()));
  // Each buffer must be of this size to avoid unnecessary memcpy while caching
  // data between successive callbacks.
  const size_t required_buffer_size =
      fine_buffer_->RequiredPlayoutBufferSizeBytes();
  ALOGD("required buffer size: %" PRIuS, required_buffer_size);
  for (int i = 0; i < kNumOfOpenSLESBuffers; ++i) {
    audio_buffers_[i].reset(new SLint8[required_buffer_size]);
  }
}

bool AudioDeviceGonk::CreateEngine() {
  ALOGD("CreateEngine");
  RTC_DCHECK(thread_checker_.CalledOnValidThread());
  if (engine_object_.Get())
    return true;
  RTC_DCHECK(!engine_);
  const SLEngineOption option[] = {
    {SL_ENGINEOPTION_THREADSAFE, static_cast<SLuint32>(SL_BOOLEAN_TRUE)}};
  RETURN_ON_ERROR(
      slCreateEngine(engine_object_.Receive(), 1, option, 0, NULL, NULL),
      false);
  RETURN_ON_ERROR(
      engine_object_->Realize(engine_object_.Get(), SL_BOOLEAN_FALSE), false);
  RETURN_ON_ERROR(engine_object_->GetInterface(engine_object_.Get(),
                                               SL_IID_ENGINE, &engine_),
                  false);
  return true;
}

void AudioDeviceGonk::DestroyEngine() {
  ALOGD("DestroyEngine");
  RTC_DCHECK(thread_checker_.CalledOnValidThread());
  if (!engine_object_.Get())
    return;
  engine_ = nullptr;
  engine_object_.Reset();
}

bool AudioDeviceGonk::CreateMix() {
  ALOGD("CreateMix");
  RTC_DCHECK(thread_checker_.CalledOnValidThread());
  RTC_DCHECK(engine_);
  if (output_mix_.Get())
    return true;

  // Create the ouput mix on the engine object. No interfaces will be used.
  RETURN_ON_ERROR((*engine_)->CreateOutputMix(engine_, output_mix_.Receive(), 0,
                                              NULL, NULL),
                  false);
  RETURN_ON_ERROR(output_mix_->Realize(output_mix_.Get(), SL_BOOLEAN_FALSE),
                  false);
  return true;
}

void AudioDeviceGonk::DestroyMix() {
  ALOGD("DestroyMix");
  RTC_DCHECK(thread_checker_.CalledOnValidThread());
  if (!output_mix_.Get())
    return;
  output_mix_.Reset();
}

bool AudioDeviceGonk::CreateAudioPlayer() {
  ALOGD("CreateAudioPlayer");
  RTC_DCHECK(thread_checker_.CalledOnValidThread());
  RTC_DCHECK(engine_object_.Get());
  RTC_DCHECK(output_mix_.Get());
  if (player_object_.Get())
    return true;
  RTC_DCHECK(!player_);
  RTC_DCHECK(!simple_buffer_queue_);
  RTC_DCHECK(!volume_);

  // source: Android Simple Buffer Queue Data Locator is source.
  SLDataLocator_AndroidSimpleBufferQueue simple_buffer_queue = {
      SL_DATALOCATOR_ANDROIDSIMPLEBUFFERQUEUE,
      static_cast<SLuint32>(kNumOfOpenSLESBuffers)};
  SLDataSource audio_source = {&simple_buffer_queue, &pcm_format_};

  // sink: OutputMix-based data is sink.
  SLDataLocator_OutputMix locator_output_mix = {SL_DATALOCATOR_OUTPUTMIX,
                                                output_mix_.Get()};
  SLDataSink audio_sink = {&locator_output_mix, NULL};

  // Define interfaces that we indend to use and realize.
  const SLInterfaceID interface_ids[] = {
      SL_IID_ANDROIDCONFIGURATION, SL_IID_BUFFERQUEUE, SL_IID_VOLUME};
  const SLboolean interface_required[] = {
      SL_BOOLEAN_TRUE, SL_BOOLEAN_TRUE, SL_BOOLEAN_TRUE};

  // Create the audio player on the engine interface.
  RETURN_ON_ERROR(
      (*engine_)->CreateAudioPlayer(
          engine_, player_object_.Receive(), &audio_source, &audio_sink,
          arraysize(interface_ids), interface_ids, interface_required),
      false);

  // Use the Android configuration interface to set platform-specific
  // parameters. Should be done before player is realized.
  SLAndroidConfigurationItf player_config;
  RETURN_ON_ERROR(
      player_object_->GetInterface(player_object_.Get(),
                                   SL_IID_ANDROIDCONFIGURATION, &player_config),
      false);
  // Set audio player configuration to SL_ANDROID_STREAM_VOICE which
  // corresponds to android.media.AudioManager.STREAM_VOICE_CALL.
  SLint32 stream_type = SL_ANDROID_STREAM_VOICE;
  RETURN_ON_ERROR(
      (*player_config)
          ->SetConfiguration(player_config, SL_ANDROID_KEY_STREAM_TYPE,
                             &stream_type, sizeof(SLint32)),
      false);

  // Realize the audio player object after configuration has been set.
  RETURN_ON_ERROR(
      player_object_->Realize(player_object_.Get(), SL_BOOLEAN_FALSE), false);

  // Get the SLPlayItf interface on the audio player.
  RETURN_ON_ERROR(
      player_object_->GetInterface(player_object_.Get(), SL_IID_PLAY, &player_),
      false);

  // Get the SLAndroidSimpleBufferQueueItf interface on the audio player.
  RETURN_ON_ERROR(
      player_object_->GetInterface(player_object_.Get(), SL_IID_BUFFERQUEUE,
                                   &simple_buffer_queue_),
      false);

  // Register callback method for the Android Simple Buffer Queue interface.
  // This method will be called when the native audio layer needs audio data.
  RETURN_ON_ERROR((*simple_buffer_queue_)
                      ->RegisterCallback(simple_buffer_queue_,
                                         SimpleBufferQueueCallback, this),
                  false);

  // Get the SLVolumeItf interface on the audio player.
  RETURN_ON_ERROR(player_object_->GetInterface(player_object_.Get(),
                                               SL_IID_VOLUME, &volume_),
                  false);

  // TODO(henrika): might not be required to set volume to max here since it
  // seems to be default on most devices. Might be required for unit tests.
  // RETURN_ON_ERROR((*volume_)->SetVolumeLevel(volume_, 0), false);

  return true;
}

void AudioDeviceGonk::DestroyAudioPlayer() {
  ALOGD("DestroyAudioPlayer");
  RTC_DCHECK(thread_checker_.CalledOnValidThread());
  if (!player_object_.Get())
    return;
  player_object_.Reset();
  player_ = nullptr;
  simple_buffer_queue_ = nullptr;
  volume_ = nullptr;
}

SLuint32 AudioDeviceGonk::GetPlayState() const {
  RTC_DCHECK(player_);
  SLuint32 state;
  SLresult err = (*player_)->GetPlayState(player_, &state);
  if (SL_RESULT_SUCCESS != err) {
    ALOGE("GetPlayState failed: %d", err);
  }
  return state;
}

} // namespace webrtc
