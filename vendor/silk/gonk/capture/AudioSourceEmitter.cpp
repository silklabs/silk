/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture"
#include <utils/Log.h>

#include <media/stagefright/MetaData.h>
#include <media/stagefright/AudioSource.h>

#include "AudioSourceEmitter.h"
#include "Channel.h"

using namespace android;

AudioSourceEmitter::AudioSourceEmitter(Channel* channel, const sp<MediaSource> &source) :
    mChannel(channel),
    mSource(source) {
}

AudioSourceEmitter::~AudioSourceEmitter() {
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

  if (err == ::OK) {
    mChannel->send(Channel::TAG_MIC,
        (const uint8_t *) (*buffer)->data() + (*buffer)->range_offset(),
        (*buffer)->range_length()
    );
  }

  return err;
}

