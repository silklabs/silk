/*
 *  Copyright (c) 2013 The WebRTC project authors. All Rights Reserved.
 *  Copyright (c) 2016 Silk Labs, Inc. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#include "webrtc/base/platform_thread.h"
#include "webrtc/modules/audio_device/gonk/audio_device_gonk.h"
#include "webrtc/system_wrappers/include/sleep.h"
#include "CaptureDataSocket.h"
#include <cutils/sockets.h>
#include <fcntl.h>
#include <poll.h>

#define LOG_TAG "audio_device_gonk"
#include <utils/Log.h>

#ifndef AUDIO_DEVICE_GONK__BYTESPERSAMPLE
#error AUDIO_DEVICE_GONK__BYTESPERSAMPLE undefined
#endif
#ifndef AUDIO_DEVICE_GONK__NUMCHANNELS
#error AUDIO_DEVICE_GONK__NUMCHANNELS undefined
#endif
#ifndef AUDIO_DEVICE_GONK__SAMPLERATE
#error AUDIO_DEVICE_GONK__SAMPLERATE undefined
#endif

const size_t kRecordingBufferSize = AUDIO_DEVICE_GONK__SAMPLERATE / 100 *
  AUDIO_DEVICE_GONK__NUMCHANNELS * AUDIO_DEVICE_GONK__BYTESPERSAMPLE;
const size_t kRecordingFramesIn10MS = AUDIO_DEVICE_GONK__SAMPLERATE / 100;


namespace webrtc {

AudioDeviceGonk::AudioDeviceGonk()
    : _recording(false),
      _socket(-1),
      _ptrAudioBuffer(nullptr),
      _critSect(*CriticalSectionWrapper::CreateCriticalSection()),
      _pcmData(nullptr),
      _pcmDataSize(-1)
{
}

AudioDeviceGonk::~AudioDeviceGonk() {
  Terminate();
}

int32_t AudioDeviceGonk::ActiveAudioLayer(
    AudioDeviceModule::AudioLayer& audioLayer) const {
  return -1;
}

int32_t AudioDeviceGonk::Init() { return 0; }

int32_t AudioDeviceGonk::Terminate() {
  StopRecording();
  return 0;
}

bool AudioDeviceGonk::Initialized() const { return true; }

int16_t AudioDeviceGonk::PlayoutDevices() { return -1; }

int16_t AudioDeviceGonk::RecordingDevices() { return 1; }

int32_t AudioDeviceGonk::PlayoutDeviceName(uint16_t index,
                                            char name[kAdmMaxDeviceNameSize],
                                            char guid[kAdmMaxGuidSize]) {
  return -1;
}

int32_t AudioDeviceGonk::RecordingDeviceName(uint16_t index,
                                              char name[kAdmMaxDeviceNameSize],
                                              char guid[kAdmMaxGuidSize]) {
  return -1;
}

int32_t AudioDeviceGonk::SetPlayoutDevice(uint16_t index) { return -1; }

int32_t AudioDeviceGonk::SetPlayoutDevice(
    AudioDeviceModule::WindowsDeviceType device) {
  return -1;
}

int32_t AudioDeviceGonk::SetRecordingDevice(uint16_t index) {
  if (index != 0) {
    ALOGW("Unknown recording device: %d", index);
    return -1;
  }
  return 0;
}

int32_t AudioDeviceGonk::SetRecordingDevice(
    AudioDeviceModule::WindowsDeviceType device) { return -1; }

int32_t AudioDeviceGonk::PlayoutIsAvailable(bool& available) { return -1; }

int32_t AudioDeviceGonk::InitPlayout() { return -1; }

bool AudioDeviceGonk::PlayoutIsInitialized() const { return false; }

int32_t AudioDeviceGonk::RecordingIsAvailable(bool& available) {
  available = true;
  return 0;
}

int32_t AudioDeviceGonk::InitRecording() { return 0; }

bool AudioDeviceGonk::RecordingIsInitialized() const { return true; }

int32_t AudioDeviceGonk::StartPlayout() { return -1; }

int32_t AudioDeviceGonk::StopPlayout() { return 0; }

bool AudioDeviceGonk::Playing() const { return false; }

int32_t AudioDeviceGonk::StartRecording() {
  CriticalSectionScoped lock(&_critSect);

  if (_recording) {
    ALOGI("Already recording");
    return 0;
  }

  if (_ptrAudioBuffer == nullptr) {
    ALOGE("Null audio buffer");
    return -1;
  }

  _socket = socket_local_client(CAPTURE_MIC_DATA_SOCKET_NAME,
                                ANDROID_SOCKET_NAMESPACE_RESERVED,
                                SOCK_STREAM);

  if (_socket < 0) {
    ALOGE("Error connecting to " CAPTURE_MIC_DATA_SOCKET_NAME " socket: %d", _socket);
    return -1;
  }

  int flags = fcntl(_socket, F_GETFL, 0);
  fcntl(_socket, F_SETFL, flags | O_NONBLOCK);

  _ptrAudioBuffer->SetRecordingSampleRate(AUDIO_DEVICE_GONK__SAMPLERATE);
  _ptrAudioBuffer->SetRecordingChannels(AUDIO_DEVICE_GONK__NUMCHANNELS);

  _recording = true;

  _ptrThreadRec.reset(new rtc::PlatformThread(RecThreadFunc, this, "audio_device_gonk"));
  _ptrThreadRec->Start();
  _ptrThreadRec->SetPriority(rtc::kRealtimePriority);

  return 0;
}

int32_t AudioDeviceGonk::StopRecording() {
  {
    CriticalSectionScoped lock(&_critSect);
    _recording = false;
  }

  if (_ptrThreadRec) {
    _ptrThreadRec->Stop();
    _ptrThreadRec.reset();
  }

  if (_socket >= 0) {
    close(_socket);
    _socket = -1;
  }

  delete [] _pcmData;
  _pcmData = nullptr;
  _pcmDataSize = -1;
  return 0;
}

bool AudioDeviceGonk::Recording() const {
  return _recording;
}

int32_t AudioDeviceGonk::SetAGC(bool enable) { return -1; }

bool AudioDeviceGonk::AGC() const { return false; }

int32_t AudioDeviceGonk::SetWaveOutVolume(uint16_t volumeLeft,
                                           uint16_t volumeRight) {
  return -1;
}

int32_t AudioDeviceGonk::WaveOutVolume(uint16_t& volumeLeft,
                                        uint16_t& volumeRight) const {
  return -1;
}

int32_t AudioDeviceGonk::InitSpeaker() { return -1; }

bool AudioDeviceGonk::SpeakerIsInitialized() const { return false; }

int32_t AudioDeviceGonk::InitMicrophone() { return -1; }

bool AudioDeviceGonk::MicrophoneIsInitialized() const { return false; }

int32_t AudioDeviceGonk::SpeakerVolumeIsAvailable(bool& available) {
  return -1;
}

int32_t AudioDeviceGonk::SetSpeakerVolume(uint32_t volume) { return -1; }

int32_t AudioDeviceGonk::SpeakerVolume(uint32_t& volume) const { return -1; }

int32_t AudioDeviceGonk::MaxSpeakerVolume(uint32_t& maxVolume) const {
  return -1;
}

int32_t AudioDeviceGonk::MinSpeakerVolume(uint32_t& minVolume) const {
  return -1;
}

int32_t AudioDeviceGonk::SpeakerVolumeStepSize(uint16_t& stepSize) const {
  return -1;
}

int32_t AudioDeviceGonk::MicrophoneVolumeIsAvailable(bool& available) {
  return -1;
}

int32_t AudioDeviceGonk::SetMicrophoneVolume(uint32_t volume) { return -1; }

int32_t AudioDeviceGonk::MicrophoneVolume(uint32_t& volume) const {
  return -1;
}

int32_t AudioDeviceGonk::MaxMicrophoneVolume(uint32_t& maxVolume) const {
  return -1;
}

int32_t AudioDeviceGonk::MinMicrophoneVolume(uint32_t& minVolume) const {
  return -1;
}

int32_t AudioDeviceGonk::MicrophoneVolumeStepSize(uint16_t& stepSize) const {
  return -1;
}

int32_t AudioDeviceGonk::SpeakerMuteIsAvailable(bool& available) { return -1; }

int32_t AudioDeviceGonk::SetSpeakerMute(bool enable) { return -1; }

int32_t AudioDeviceGonk::SpeakerMute(bool& enabled) const { return -1; }

int32_t AudioDeviceGonk::MicrophoneMuteIsAvailable(bool& available) {
  return -1;
}

int32_t AudioDeviceGonk::SetMicrophoneMute(bool enable) { return -1; }

int32_t AudioDeviceGonk::MicrophoneMute(bool& enabled) const { return -1; }

int32_t AudioDeviceGonk::MicrophoneBoostIsAvailable(bool& available) {
  return -1;
}

int32_t AudioDeviceGonk::SetMicrophoneBoost(bool enable) { return -1; }

int32_t AudioDeviceGonk::MicrophoneBoost(bool& enabled) const { return -1; }

int32_t AudioDeviceGonk::StereoPlayoutIsAvailable(bool& available) {
  return -1;
}
int32_t AudioDeviceGonk::SetStereoPlayout(bool enable) { return -1; }

int32_t AudioDeviceGonk::StereoPlayout(bool& enabled) const { return -1; }

int32_t AudioDeviceGonk::StereoRecordingIsAvailable(bool& available) {
  return -1;
}

int32_t AudioDeviceGonk::SetStereoRecording(bool enable) { return -1; }

int32_t AudioDeviceGonk::StereoRecording(bool& enabled) const { return -1; }

int32_t AudioDeviceGonk::SetPlayoutBuffer(
    const AudioDeviceModule::BufferType type,
    uint16_t sizeMS) {
  return -1;
}

int32_t AudioDeviceGonk::PlayoutBuffer(AudioDeviceModule::BufferType& type,
                                        uint16_t& sizeMS) const {
  return -1;
}

int32_t AudioDeviceGonk::PlayoutDelay(uint16_t& delayMS) const { return -1; }

int32_t AudioDeviceGonk::RecordingDelay(uint16_t& delayMS) const { return -1; }

int32_t AudioDeviceGonk::CPULoad(uint16_t& load) const { return -1; }

bool AudioDeviceGonk::PlayoutWarning() const { return false; }

bool AudioDeviceGonk::PlayoutError() const { return false; }

bool AudioDeviceGonk::RecordingWarning() const { return false; }

bool AudioDeviceGonk::RecordingError() const { return false; }

void AudioDeviceGonk::ClearPlayoutWarning() {}

void AudioDeviceGonk::ClearPlayoutError() {}

void AudioDeviceGonk::ClearRecordingWarning() {}

void AudioDeviceGonk::ClearRecordingError() {}

void AudioDeviceGonk::AttachAudioBuffer(AudioDeviceBuffer* audioBuffer) {
  _ptrAudioBuffer = audioBuffer;

  // Inform the AudioBuffer about default settings for this implementation.
  // Set all values to zero here since the actual settings will be done by
  // InitPlayout and InitRecording later.
  _ptrAudioBuffer->SetRecordingSampleRate(0);
  _ptrAudioBuffer->SetPlayoutSampleRate(0);
  _ptrAudioBuffer->SetRecordingChannels(0);
  _ptrAudioBuffer->SetPlayoutChannels(0);
}

bool AudioDeviceGonk::RecThreadFunc(void* pThis) {
  return (static_cast<AudioDeviceGonk*>(pThis)->RecThreadProcess());
}


static int readExact(int fd, char *buffer, int x, int timeout)
{
  int bytesRead = 0;
  int result;
  struct pollfd pollfd = {
    .fd = fd,
    .events = POLLIN | POLLHUP | POLLERR | POLLNVAL,
    .revents = 0
  };

  while (bytesRead < x) {
    result = TEMP_FAILURE_RETRY(poll(&pollfd, 1, timeout));
    if (result < 1) {
      return result;
    }
    if (pollfd.revents != POLLIN) {
      return -ETIMEDOUT;
    }
    result = TEMP_FAILURE_RETRY(read(fd, buffer + bytesRead, x - bytesRead));
    if (result < 1) {
      return result;
    }

    bytesRead += result;
  }
  return bytesRead;
}


bool AudioDeviceGonk::RecThreadProcess() {
  CriticalSectionScoped lock(&_critSect);

  if (!_recording) {
    return false;
  }

  capture::datasocket::PacketHeader hdr;
  int rc;

  // PCM data should be arriving every 100ms-200ms or so at most normally, so if
  // nothing arrives for a couple seconds then something is very wrong and it's
  // time to eject
  const int kCaptureSocketReadTimeout = 3000;

  rc = readExact(_socket, (char *) &hdr, sizeof(hdr), kCaptureSocketReadTimeout);
  if (rc <= 0) {
    ALOGE("Header read error: %d", rc);
    return false;
  }
  if (rc != (int) sizeof(hdr)) {
    ALOGE("Incomplete header.  Expected %d bytes, got %d bytes", sizeof(hdr), rc);
    return false;
  }

  if (hdr.size < sizeof(capture::datasocket::PacketHeader)) {
    ALOGE("BAD HEADER: %d", rc);
    return false;
  }

  if (_pcmDataSize < (int) hdr.size) {
    _pcmDataSize = (int) hdr.size;
    delete [] _pcmData;
    _pcmData = new char[_pcmDataSize];
  }

  rc = readExact(_socket, _pcmData, hdr.size, kCaptureSocketReadTimeout);
  if (rc <= 0) {
    ALOGE("Data read error: %d", rc);
    return false;
  }
  if (rc != (int) hdr.size) {
    ALOGE("Incomplete data.  Expected %d bytes, got %d bytes", hdr.size, rc);
    return false;
  }
  if (hdr.tag == capture::datasocket::TAG_MIC) {
    if (_recording) {
      size_t index = 0;
      while (index <= hdr.size - kRecordingBufferSize) {
        _ptrAudioBuffer->SetRecordedBuffer(_pcmData + index, kRecordingFramesIn10MS);
        _ptrAudioBuffer->DeliverRecordedData();
        index += kRecordingBufferSize;
      }
      if (index != hdr.size) {
        ALOGW("Discarded %d bytes worth of audio samples", hdr.size - index);
      }
    }
  }
  return true;
}


}  // namespace webrtc
