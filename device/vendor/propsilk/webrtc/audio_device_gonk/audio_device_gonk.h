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

#ifndef WEBRTC_MODULES_AUDIO_DEVICE_GONK_AUDIO_DEVICE_H_
#define WEBRTC_MODULES_AUDIO_DEVICE_GONK_AUDIO_DEVICE_H_

#include <android/log.h>
#include <memory>
#include <SLES/OpenSLES.h>
#include <SLES/OpenSLES_Android.h>
#include <SLES/OpenSLES_AndroidConfiguration.h>

#include "webrtc/base/checks.h"
#include "webrtc/base/platform_thread.h"
#include "webrtc/base/thread_checker.h"
#include "webrtc/modules/audio_device/android/opensles_common.h"
#include "webrtc/modules/audio_device/audio_device_generic.h"
#include "webrtc/system_wrappers/include/trace.h"

namespace webrtc {

class FineAudioBuffer;

class AudioDeviceGonk : public AudioDeviceGeneric
{
  // The lower output latency path is used only if the application requests a
  // buffer count of 2 or more, and a buffer size and sample rate that are
  // compatible with the device's native output configuration provided via the
  // audio manager at construction.
  static const int kNumOfOpenSLESBuffers = 4;

public:
  AudioDeviceGonk();
  virtual ~AudioDeviceGonk();

  // Retrieve the currently utilized audio layer
  int32_t ActiveAudioLayer(
    AudioDeviceModule::AudioLayer& audioLayer) const override;

  // Main initializaton and termination
  int32_t Init() override;
  int32_t Terminate() override;
  bool Initialized() const override;

  // Device enumeration
  int16_t PlayoutDevices() override;
  int16_t RecordingDevices() override;
  int32_t PlayoutDeviceName(uint16_t index,
                            char name[kAdmMaxDeviceNameSize],
                            char guid[kAdmMaxGuidSize]) override;
  int32_t RecordingDeviceName(uint16_t index,
                              char name[kAdmMaxDeviceNameSize],
                              char guid[kAdmMaxGuidSize]) override;

  // Device selection
  int32_t SetPlayoutDevice(uint16_t index) override;
  int32_t SetPlayoutDevice(
    AudioDeviceModule::WindowsDeviceType device) override;
  int32_t SetRecordingDevice(uint16_t index) override;
  int32_t SetRecordingDevice(
    AudioDeviceModule::WindowsDeviceType device) override;

  // Audio transport initialization
  int32_t PlayoutIsAvailable(bool& available) override;
  int32_t InitPlayout() override;
  bool PlayoutIsInitialized() const override;
  int32_t RecordingIsAvailable(bool& available) override;
  int32_t InitRecording() override;
  bool RecordingIsInitialized() const override;

  // Audio transport control
  int32_t StartPlayout() override;
  int32_t StopPlayout() override;
  bool Playing() const override;
  int32_t StartRecording() override;
  int32_t StopRecording() override;
  bool Recording() const override;

  // Microphone Automatic Gain Control (AGC)
  int32_t SetAGC(bool enable) override;
  bool AGC() const override;

  // Volume control based on the Windows Wave API (Windows only)
  int32_t SetWaveOutVolume(uint16_t volumeLeft,
                           uint16_t volumeRight) override;
  int32_t WaveOutVolume(uint16_t& volumeLeft,
                        uint16_t& volumeRight) const override;

  // Audio mixer initialization
  int32_t InitSpeaker() override;
  bool SpeakerIsInitialized() const override;
  int32_t InitMicrophone() override;
  bool MicrophoneIsInitialized() const override;

  // Speaker volume controls
  int32_t SpeakerVolumeIsAvailable(bool& available) override;
  int32_t SetSpeakerVolume(uint32_t volume) override;
  int32_t SpeakerVolume(uint32_t& volume) const override;
  int32_t MaxSpeakerVolume(uint32_t& maxVolume) const override;
  int32_t MinSpeakerVolume(uint32_t& minVolume) const override;
  int32_t SpeakerVolumeStepSize(uint16_t& stepSize) const override;

  // Microphone volume controls
  int32_t MicrophoneVolumeIsAvailable(bool& available) override;
  int32_t SetMicrophoneVolume(uint32_t volume) override;
  int32_t MicrophoneVolume(uint32_t& volume) const override;
  int32_t MaxMicrophoneVolume(uint32_t& maxVolume) const override;
  int32_t MinMicrophoneVolume(uint32_t& minVolume) const override;
  int32_t MicrophoneVolumeStepSize(uint16_t& stepSize) const override;

  // Speaker mute control
  int32_t SpeakerMuteIsAvailable(bool& available) override;
  int32_t SetSpeakerMute(bool enable) override;
  int32_t SpeakerMute(bool& enabled) const override;

  // Microphone mute control
  int32_t MicrophoneMuteIsAvailable(bool& available) override;
  int32_t SetMicrophoneMute(bool enable) override;
  int32_t MicrophoneMute(bool& enabled) const override;

  // Microphone boost control
  int32_t MicrophoneBoostIsAvailable(bool& available) override;
  int32_t SetMicrophoneBoost(bool enable) override;
  int32_t MicrophoneBoost(bool& enabled) const override;

  // Stereo support
  int32_t StereoPlayoutIsAvailable(bool& available) override;
  int32_t SetStereoPlayout(bool enable) override;
  int32_t StereoPlayout(bool& enabled) const override;
  int32_t StereoRecordingIsAvailable(bool& available) override;
  int32_t SetStereoRecording(bool enable) override;
  int32_t StereoRecording(bool& enabled) const override;

  // Delay information and control
  int32_t SetPlayoutBuffer(const AudioDeviceModule::BufferType type,
                           uint16_t sizeMS) override;
  int32_t PlayoutBuffer(AudioDeviceModule::BufferType& type,
                        uint16_t& sizeMS) const override;
  int32_t PlayoutDelay(uint16_t& delayMS) const override;
  int32_t RecordingDelay(uint16_t& delayMS) const override;

  // CPU load
  int32_t CPULoad(uint16_t& load) const override;

public:
  bool PlayoutWarning() const override;
  bool PlayoutError() const override;
  bool RecordingWarning() const override;
  bool RecordingError() const override;
  void ClearPlayoutWarning() override;
  void ClearPlayoutError() override;
  void ClearRecordingWarning() override;
  void ClearRecordingError() override;

public:
  void AttachAudioBuffer(AudioDeviceBuffer* audioBuffer) override;

private:
  // These callback methods are called when data is required for playout.
  // They are both called from an internal "OpenSL ES thread" which is not
  // attached to the Dalvik VM.
  static void SimpleBufferQueueCallback(SLAndroidSimpleBufferQueueItf caller,
                                        void* context);
  void FillBufferQueue();
  // Reads audio data in PCM format using the AudioDeviceBuffer.
  // Can be called both on the main thread (during Start()) and from the
  // internal audio thread while output streaming is active.
  void EnqueuePlayoutData();

  // Configures the SL_DATAFORMAT_PCM structure.
  SLDataFormat_PCM CreatePCMConfiguration(size_t channels,
                                          int sample_rate,
                                          size_t bits_per_sample);

  // Allocate memory for audio buffers which will be used to render audio
  // via the SLAndroidSimpleBufferQueueItf interface.
  void AllocateDataBuffers();

  // Creates/destroys the main engine object and the SLEngineItf interface.
  bool CreateEngine();
  void DestroyEngine();

  // Creates/destroys the output mix object.
  bool CreateMix();
  void DestroyMix();

  // Creates/destroys the audio player and the simple-buffer object.
  // Also creates the volume object.
  bool CreateAudioPlayer();
  void DestroyAudioPlayer();

  SLuint32 GetPlayState() const;

  // Ensures that methods are called from the same thread as this object is
  // created on.
  rtc::ThreadChecker thread_checker_;

  // Stores thread ID in first call to SimpleBufferQueueCallback() from internal
  // non-application thread which is not attached to the Dalvik JVM.
  // Detached during construction of this object.
  rtc::ThreadChecker thread_checker_opensles_;

  // Contains audio parameters provided to this class at construction by the
  // AudioManager.
  const AudioParameters audio_parameters_;

  // Raw pointer handle provided to us in AttachAudioBuffer(). Owned by the
  // AudioDeviceModuleImpl class and called by AudioDeviceModuleImpl::Create().
  AudioDeviceBuffer* audio_device_buffer_;

  bool playback_initialized_;
  bool playing_;

  // PCM-type format definition.
  // TODO(henrika): add support for SLAndroidDataFormat_PCM_EX (android-21) if
  // 32-bit float representation is needed.
  SLDataFormat_PCM pcm_format_;

  // Number of bytes per audio buffer in each |audio_buffers_[i]|.
  // Typical sizes are 480 or 512 bytes corresponding to native output buffer
  // sizes of 240 or 256 audio frames respectively.
  size_t bytes_per_buffer_;

  // Queue of audio buffers to be used by the player object for rendering
  // audio. They will be used in a Round-robin way and the size of each buffer
  // is given by FineAudioBuffer::RequiredBufferSizeBytes().
  std::unique_ptr<SLint8[]> audio_buffers_[kNumOfOpenSLESBuffers];

  // FineAudioBuffer takes an AudioDeviceBuffer which delivers audio data
  // in chunks of 10ms. It then allows for this data to be pulled in
  // a finer or coarser granularity. I.e. interacting with this class instead
  // of directly with the AudioDeviceBuffer one can ask for any number of
  // audio data samples.
  // Example: native buffer size is 240 audio frames at 48kHz sample rate.
  // WebRTC will provide 480 audio frames per 10ms but OpenSL ES asks for 240
  // in each callback (one every 5ms). This class can then ask for 240 and the
  // FineAudioBuffer will ask WebRTC for new data only every second callback
  // and also cach non-utilized audio.
  std::unique_ptr<FineAudioBuffer> fine_buffer_;

  // Keeps track of active audio buffer 'n' in the audio_buffers_[n] queue.
  // Example (kNumOfOpenSLESBuffers = 2): counts 0, 1, 0, 1, ...
  int buffer_index_;

  // The engine object which provides the SLEngineItf interface.
  // Created by the global Open SL ES constructor slCreateEngine().
  webrtc::ScopedSLObjectItf engine_object_;

  // This interface exposes creation methods for all the OpenSL ES object types.
  // It is the OpenSL ES API entry point.
  SLEngineItf engine_;

  // Output mix object to be used by the player object.
  webrtc::ScopedSLObjectItf output_mix_;

  // The audio player media object plays out audio to the speakers. It also
  // supports volume control.
  webrtc::ScopedSLObjectItf player_object_;

  // This interface is supported on the audio player and it controls the state
  // of the audio player.
  SLPlayItf player_;

  // The Android Simple Buffer Queue interface is supported on the audio player
  // and it provides methods to send audio data from the source to the audio
  // player for rendering.
  SLAndroidSimpleBufferQueueItf simple_buffer_queue_;

  // This interface exposes controls for manipulating the object’s audio volume
  // properties. This interface is supported on the Audio Player object.
  SLVolumeItf volume_;

  // Last time the OpenSL ES layer asked for audio data to play out.
  uint32_t last_play_time_;

  bool recording_initialized_;
  bool recording_;
  SLObjectItf recorder_object_;
  SLRecordItf recorder_;
  std::unique_ptr<SLint8[]> recorder_buffers_[kNumOfOpenSLESBuffers];
  int recorder_buffer_index_;
  SLAndroidSimpleBufferQueueItf recorder_buffer_queue_;
};

} // namespace webrtc

#endif // WEBRTC_MODULES_AUDIO_DEVICE_GONK_AUDIO_DEVICE_H_
