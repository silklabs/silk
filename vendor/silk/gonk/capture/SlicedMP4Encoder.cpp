/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#define LOG_TAG "silk-capture"
#include <utils/Log.h>

#include "SlicedMP4Encoder.h"
#include "Capturedefs.h"
#include "MPEG4MemoryWriter.h"

#include <media/mediarecorder.h>
#include <media/stagefright/AudioSource.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/foundation/ABuffer.h>
#include <media/stagefright/foundation/AMessage.h>
#include <media/stagefright/MediaDefs.h>
#include <media/stagefright/MetaData.h>
#include <include/avc_utils.h>
#include <media/stagefright/OMXCodec.h>

using namespace android;

//
// Implementation of class PutBackWrapper
//
PutBackWrapper::PutBackWrapper(const sp<MediaSource> &source) :
    mSource(source),
    mDone(false) {
}

PutBackWrapper::~PutBackWrapper() {
  for (size_t n = 0; n < mStash.size(); ++n)
    mStash[n]->release();
}

status_t PutBackWrapper::start(MetaData *params) {
  return mSource->start(params);
}

status_t PutBackWrapper::stop() {
  return mSource->stop();
}

sp<MetaData> PutBackWrapper::getFormat() {
  return mSource->getFormat();
}

status_t PutBackWrapper::read(MediaBuffer **buffer,
    const ReadOptions *options) {
  if (mStash.size() > 0) {
    *buffer = mStash.top();
    mStash.pop();
    return ::OK;
  }
  status_t err = mSource->read(buffer, options);
  if (err != ::OK)
    mDone = true;
  return err;
}

void PutBackWrapper::putBack(MediaBuffer **buffer) {
  mStash.push(*buffer);
  *buffer = NULL;
}

//
// Implementation of class SliceAudioSource
//
SliceAudioSource::SliceAudioSource(const sp<MediaSource> &source) :
    mSource(new PutBackWrapper(source)),
    mStarted(false),
    mVideoTimeUs(0) {
}

SliceAudioSource::~SliceAudioSource() {
}

status_t SliceAudioSource::start(MetaData *params) {
  if (mStarted)  // don't start again
    return ::OK;
  mStarted = true;
  return mSource->start(params);
}

status_t SliceAudioSource::stop() {
  // we don't stop here since we start()/stop() repeatedly
  return ::OK;
}

sp<MetaData> SliceAudioSource::getFormat() {
  return mSource->getFormat();
}

status_t SliceAudioSource::read(MediaBuffer **buffer,
    const ReadOptions *options) {
  status_t err = mSource->read(buffer, options);
  if (err != ::OK) {
    // Stop the input stream here
    mSource->stop();
    return err;
  }

  int64_t timeUs, driftTimeUs;
  if (!(*buffer)->meta_data()->findInt64(kKeyTime, &timeUs))
    timeUs = 0;
  if (!(*buffer)->meta_data()->findInt64(kKeyDriftTime, &driftTimeUs))
    driftTimeUs = 0;

  // Make sure that video doesn't lag behind audio
  {
    Mutex::Autolock autoLock(mLock);

    while (timeUs > mVideoTimeUs) {
      mWaitForProgress.wait(mLock);
    }
  }

  // Check whether we have to slice the audio stream
  {
    Mutex::Autolock autoLock(mLock);

    // The audio data is sAudioChannels channels, 16-bit PCM with sAudioSampleRate
    int32_t usPerSample = 1000000 / sAudioSampleRate;
    int32_t frames = (*buffer)->range_length() / sAudioChannels
        / sizeof(int16_t);
    int32_t durationUs = frames * usPerSample;
    int64_t endUs = timeUs + durationUs;

    int64_t sliceTimeUs;
    while (mVideoSliceTimes.size() > 0
        && (sliceTimeUs = mVideoSliceTimes[0]) < endUs) {
      // Is the whole buffer past the slice time?
      if (timeUs > sliceTimeUs) {
        // We have reached this slice time so remove it from the list
        mVideoSliceTimes.removeAt(0);
        // Put the buffer back. We will get here eventually. End the audio stream since
        // we are fully past the video stream.
        mSource->putBack(buffer);
        return ERROR_END_OF_STREAM;
      }

      // Is the slice time is within this buffer?
      if (sliceTimeUs >= timeUs && sliceTimeUs <= endUs) {
        int32_t prevFrames = (sliceTimeUs - timeUs) / usPerSample;
        int32_t nextFrames = frames - prevFrames;
        if (prevFrames) {
          // Split the buffer in two and return the first half. Next iteration will
          // end this stream. The other half goes back into the queue to be
          // processed later.
          MediaBuffer *dup = new MediaBuffer((*buffer)->data(),
              (*buffer)->size());
          dup->meta_data()->setInt64(kKeyTime, sliceTimeUs);
          dup->meta_data()->setInt64(kKeyDriftTime, driftTimeUs);
          (*buffer)->set_range(0,
              prevFrames * sAudioChannels * sizeof(int16_t));
          dup->set_range((*buffer)->range_length(),
              nextFrames * sAudioChannels * sizeof(int16_t));
          mSource->putBack(&dup);
          return ::OK;
        }
        // We have reached this slice time so remove it from the list
        mVideoSliceTimes.removeAt(0);
        // The buffer is fully in the new slice so just end the stream and return
        // the buffer to be picked up again shortly.
        mSource->putBack(buffer);
        return ERROR_END_OF_STREAM;
      }
    }
  }

  return ::OK;
}

void SliceAudioSource::handleProgressEvent(int64_t timeUs, bool slice) {
  Mutex::Autolock autoLock(mLock);

  // Wake up the audio thread if its waiting for video to advance.
  mVideoTimeUs = timeUs;
  if (slice)
    mVideoSliceTimes.push(timeUs);
  mWaitForProgress.signal();
}

//
// Implementation of class SliceAtEachIDRSource
//
SliceAtEachIDRSource::SliceAtEachIDRSource(const sp<MediaSource> &source) :
    mSource(new PutBackWrapper(source)),
    mStarted(false),
    mIDRSeen(false) {
}

SliceAtEachIDRSource::~SliceAtEachIDRSource() {
}

status_t SliceAtEachIDRSource::start(MetaData *params) {
  mIDRSeen = false;
  if (mStarted)  // don't start again
    return ::OK;
  mStarted = true;
  return mSource->start(params);
}

status_t SliceAtEachIDRSource::stop() {
  // we don't stop here since we start()/stop() repeatedly
  return ::OK;
}

sp<MetaData> SliceAtEachIDRSource::getFormat() {
  return mSource->getFormat();
}

status_t SliceAtEachIDRSource::read(MediaBuffer **buffer,
    const ReadOptions *options) {
  status_t err = mSource->read(buffer, options);
  if (err != ::OK) {
    // Stop the input stream here
    mSource->stop();
    return err;
  }

  int64_t timeUs;
  if (!(*buffer)->meta_data()->findInt64(kKeyTime, &timeUs))
    timeUs = 0;

  int32_t config;
  if ((*buffer)->meta_data()->findInt32(kKeyIsCodecConfig, &config) && config) {
    // Make sure we find the codec config for the next slices in getFormat()
    sp<ABuffer> au = new ABuffer(
        static_cast<char *>((*buffer)->data()) + (*buffer)->range_offset(),
        (*buffer)->range_length());
    sp<MetaData> meta = MakeAVCCodecSpecificData(au);
    const void *data;
    size_t size;
    uint32_t type;
    if (meta->findData(kKeyAVCC, &type, &data, &size))
      mSource->getFormat()->setData(kKeyAVCC, type, data, size);
  }

  int32_t isSync;
  if ((*buffer)->meta_data()->findInt32(kKeyIsSyncFrame, &isSync) && isSync) {
    if (mIDRSeen) {
      // Terminate the stream at the IDR
      mSource->putBack(buffer);

      // Slice the stream here
      notifyListeners(timeUs, true);
      return ERROR_END_OF_STREAM;
    }
    mIDRSeen = true;
  }

  // Progress but we aren't slicing
  notifyListeners(timeUs, false);
  return ::OK;
}

void SliceAtEachIDRSource::notifyListeners(int64_t timeUs, bool slice) {
  for (size_t n = 0; n < mListeners.size(); ++n)
    mListeners[n]->handleProgressEvent(timeUs, slice);
}

//
// Implementation of class SlicedMP4Encoder
//
SlicedMP4Encoder::SlicedMP4Encoder(sp<ALooper> looper, Channel *channel,
    sp<MediaSource> cameraSource) :
    mChannel(channel),
    mLooper(looper) {
  // Setup video encoder
  sp<MetaData> meta = cameraSource->getFormat();
  int32_t width, height, stride, sliceHeight, colorFormat;
  CHECK(meta->findInt32(kKeyWidth, &width));
  CHECK(meta->findInt32(kKeyHeight, &height));
  CHECK(meta->findInt32(kKeyStride, &stride));
  CHECK(meta->findInt32(kKeySliceHeight, &sliceHeight));
  CHECK(meta->findInt32(kKeyColorFormat, &colorFormat));

  sp<AMessage> videoFormat = new AMessage();
  videoFormat->setInt32("width", width);
  videoFormat->setInt32("height", height);
  videoFormat->setInt32("stride", stride);
  videoFormat->setInt32("slice-height", sliceHeight);
  videoFormat->setInt32("color-format", colorFormat);

  videoFormat->setString("mime", kMimeTypeAvc);
  videoFormat->setInt32("bitrate", sVideoBitRateInK * 1024);
  videoFormat->setInt32("bitrate-mode", OMX_Video_ControlRateVariable);
  videoFormat->setFloat("frame-rate", sFPS);
  videoFormat->setInt32("i-frame-interval", sIFrameIntervalSec);

  mVideoEncoder = MediaCodecSource::Create(mLooper, videoFormat, cameraSource);

  // Setup audio
  sp<MediaSource> audioSource = new AudioSource(AUDIO_SOURCE_MIC,
      sAudioSampleRate, sAudioChannels);

  int32_t maxInputSize, channels, sampleRate, bitrate;
  CHECK(audioSource->getFormat()->findInt32(kKeyMaxInputSize, &maxInputSize));
  CHECK(audioSource->getFormat()->findInt32(kKeySampleRate, &sampleRate));
  CHECK(audioSource->getFormat()->findInt32(kKeyChannelCount, &channels));

  mAudioFormat = new AMessage();
  mAudioFormat->setString("mime", MEDIA_MIMETYPE_AUDIO_AAC);
  mAudioFormat->setInt32("aac-profile", OMX_AUDIO_AACObjectLC);
  mAudioFormat->setInt32("max-input-size", maxInputSize);
  mAudioFormat->setInt32("sample-rate", sampleRate);
  mAudioFormat->setInt32("channel-count", channels);
  mAudioFormat->setInt32("bitrate", sAudioBitRate);

  mSlicedVideoSource = new SliceAtEachIDRSource(mVideoEncoder);
  mSlicedAudioSource = new SliceAudioSource(audioSource);

  // The video stream drives where the audio stream is sliced
  mSlicedVideoSource->addListener(mSlicedAudioSource.get());
}

bool SlicedMP4Encoder::threadLoop() {
  while (true) {
    sp<MPEG4MemoryWriter> writer = new MPEG4MemoryWriter();

    writer->addSource(mSlicedVideoSource);

    // Turn off audio until we sort out timing and performance issues on iOS
#if 0
    sp<MediaCodecSource> audioEncoder =
    MediaCodecSource::Create(mLooper, mAudioFormat, mSlicedAudioSource);

    writer->addSource(audioEncoder);
#endif

    sp<MetaData> params = new MetaData();
    params->setInt32(kKeyFileType, OUTPUT_FORMAT_MPEG_4);
    params->setInt32(kKeyRealTimeRecording, false);

    timeval when;
    gettimeofday(&when, NULL);

    CHECK_EQ(writer->start(params.get()), ::OK);
    writer->waitForEOS();
    status_t err = writer->stop();
    if (err == ::OK) {
      // Write size and .mp4 data
      mChannel->send(TAG_VIDEO, when, writer->data().array(),
          writer->data().size());
    } else {
      ALOGW("MPEG4MemoryWriter stop failed with %d. No video data sent", err);
    }

    writer = NULL;
  }
}
