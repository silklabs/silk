/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#define LOG_NDEBUG 0
#define LOG_TAG "mic"
#include <utils/Log.h>

#include "Micdefs.h"
#include "AudioReader.h"

#include <media/mediarecorder.h>
#include <media/stagefright/MediaSource.h>
#include <media/stagefright/AudioSource.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/foundation/ABuffer.h>
#include <media/stagefright/foundation/AMessage.h>
#include <media/stagefright/MediaDefs.h>
#include <media/stagefright/MetaData.h>
#include <include/avc_utils.h>
#include <utils/Thread.h>

#include <unistd.h>

using namespace android;

status_t OK = static_cast<status_t>(android::OK);

AudioReader::AudioReader(Channel *channel, int32_t audioSampleRate,
  int32_t audioChannels) :
    mChannel(channel) {

  mAudioSource = new AudioSource(AUDIO_SOURCE_MIC,
      audioSampleRate, audioChannels);

  if (mAudioSource->initCheck() != ::OK) {
    ALOGE("AudioSource init failed %d", mAudioSource->initCheck());
  }
}

bool AudioReader::threadLoop() {
  status_t err = ::OK;

  mAudioSource->start();
  while (true) {
    MediaBuffer *buffer;
    while (!exitPending() && (err = mAudioSource->read(&buffer)) == ::OK) {
      if (buffer) {
        if (buffer->range_length()) {
          mChannel->send(TAG_AUDIO, 
            (const uint8_t *) buffer->data() + buffer->range_offset(),
            buffer->range_length());
        }
        buffer->release();
        buffer = NULL;
      }
    }
    if (exitPending()) {
      break;
    } else {
      ALOGI("AudioReader read buffer error!");
      usleep(20000);
    }
  }
  return false;
}

void AudioReader::start() {
  run();
}

void AudioReader::stop() {
  requestExitAndWait(); // stop thread
  mAudioSource->stop(); // stop audio 
  mAudioSource.clear(); // deallocate audio
}
