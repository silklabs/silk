/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#ifndef AUDIO_READER_H_
#define AUDIO_READER_H_

#include <utils/Thread.h>
#include <media/stagefright/AudioSource.h>

#include "Channel.h"

class AudioReader : public Thread {
  Channel *mChannel;
  sp<AudioSource> mAudioSource;

public:
  AudioReader(Channel *channel, int32_t audioSampleRate, int32_t audioChannels);
  virtual bool threadLoop();
  void start();
  void stop();
};

#endif
