/*
 * Copyright (C) 2012 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// #define LOG_NDEBUG 0
#define LOG_TAG "StreamPlayer"
#include <utils/Log.h>

#include "StreamPlayer.h"
#include <fcntl.h>

#include <gui/Surface.h>
#include <media/AudioTrack.h>
#include <media/ICrypto.h>
#include <media/IMediaHTTPService.h>
#include <media/stagefright/foundation/ABuffer.h>
#include <media/stagefright/foundation/AMessage.h>
#include <media/stagefright/MediaCodec.h>
#include <media/stagefright/MediaErrors.h>
#include <media/stagefright/NuMediaExtractor.h>
#include <media/stagefright/Utils.h>
#include <media/stagefright/MetaData.h>
#include <media/stagefright/MediaDefs.h>
#include <media/stagefright/FileSource.h>

#ifndef TARGET_GE_MARSHMALLOW
#include <media/stagefright/NativeWindowWrapper.h>
#define AStringPrintf StringPrintf
#endif

#define BUF_SIZE 8192

#undef CHECK
#define CHECK(condition,errorMsg)                \
  if (!(condition)) {                            \
    ALOGE("%s:%d "                               \
        " CHECK(" #condition ") failed.",        \
        __FILE__,__LINE__);                      \
    notify(MEDIA_ERROR, errorMsg);               \
    return UNKNOWN_ERROR;                        \
  }

#undef CHECK_EQ
#define CHECK_EQ(x,y,errorMsg)                   \
  do {                                           \
    if (x != y) {                                \
      ALOGE("%s:%d "                             \
        " CHECK_EQ" "( " #x "," #y ") failed: ", \
        __FILE__,__LINE__);                      \
      notify(MEDIA_ERROR, errorMsg);             \
      return UNKNOWN_ERROR;                      \
    }                                            \
  } while (false)

#undef CHECK_LE
#define CHECK_LE(x,y,errorMsg)                   \
  do {                                           \
    if (x > y) {                                 \
      ALOGE("%s:%d "                             \
        " CHECK_LE" "( " #x "," #y ") failed: ", \
        __FILE__,__LINE__);                      \
      notify(MEDIA_ERROR, errorMsg);             \
      return UNKNOWN_ERROR;                      \
    }                                            \
  } while (false)

namespace android {

/**
 * Handle end of stream event
 */
static void audioCallback(int event, void* user, void *info) {
  StreamPlayer *player = (StreamPlayer*) user;
  switch (event) {
    case AudioTrack::EVENT_MARKER: {
      ALOGD("Received event EVENT_MARKER");
      if (player != NULL) {
        player->reset();
      }
      break;
    }
    default:
      ALOGV("Received unknown event %d", event);
      break;
  }
}

StreamPlayer::StreamPlayer() :
    mState(UNPREPARED),
    mDoMoreStuffGeneration(0),
    mListener(NULL),
    mDurationUs(-1),
    mGain(1.0),
    mAudioTrackFormat(NULL) {
  ALOGV("Finished initializing StreamPlayer");
}

StreamPlayer::~StreamPlayer(){
  ALOGV("Exiting StreamPlayer");
}

void StreamPlayer::setDataSource(uint32_t dataSourceType, const char *path) {
  ALOGV("%s", __FUNCTION__);

  mDataSourceType = dataSourceType;
  mPath = path;

  ALOGV("datasource type %d fileName %s", mDataSourceType, mPath.c_str());
  if (mDataSourceType == DATA_SOURCE_TYPE_BUFFER) {
    mBufferedDataSource = new BufferedDataSource();
  }

  ALOGV("setting datasource done");
}

status_t StreamPlayer::setListener(const sp<StreamPlayerListener>& listener) {
  ALOGV("setListener");
  mListener = listener;
  return NO_ERROR;
}

void StreamPlayer::notify(int msg, const char* errorMsg) {
  if (mListener != NULL) {
    Mutex::Autolock _l(mNotifyLock);
    mListener->notify(msg, errorMsg);
  }
}

/**
 * Write the audio buffer to the BufferedDataSource to be played
 */
int StreamPlayer::write(const void* bytes, size_t size) {
  if (mDataSourceType != DATA_SOURCE_TYPE_BUFFER) {
    notify(MEDIA_ERROR, "Invalid data source");
    return 0;
  }

  sp<ABuffer> abuffer = ABuffer::CreateAsCopy(bytes, size);
  if (abuffer != NULL) {
    mBufferedDataSource->queueBuffer(abuffer);
    return size;
  }
  return 0;
}

/**
 * Set stream volume (gain)
 */
void StreamPlayer::setVolume(float gain) {
  ALOGD("Audio player setting volume %f", gain);
  mGain = gain;

  if (mCodecState.mAudioTrack != NULL) {
    mCodecState.mAudioTrack->setVolume(gain);
  }
}

void StreamPlayer::start() {
  ALOGV("%s", __FUNCTION__);
  sp<AMessage> msg = getMessage(kWhatStart);
  msg->post();
}

void StreamPlayer::pause() {
  ALOGV("%s", __FUNCTION__);

  sp<AMessage> msg = getMessage(kWhatStop);
  msg->post();
}

void StreamPlayer::getCurrentPosition(int* msec) {
  ALOGV("%s", __FUNCTION__);

  int64_t timeUs;
  if (mExtractor != NULL && mExtractor->getSampleTime(&timeUs) == OK) {
    *msec = timeUs / 1000;
  } else {
    *msec = -1;
  }
}

void StreamPlayer::getDuration(int64_t* msec) {
  if (mDurationUs > 0) {
    *msec = mDurationUs / 1000;
  } else {
    *msec = -1;
  }
}

void StreamPlayer::eos() {
  ALOGV("%s", __FUNCTION__);
  if (mBufferedDataSource != NULL) {
    mBufferedDataSource->queueEOS(ERROR_END_OF_STREAM);
  }
}

void StreamPlayer::reset() {
  ALOGV("%s", __FUNCTION__);
  sp<AMessage> msg = getMessage(kWhatReset);
  msg->post();
}

void StreamPlayer::onMessageReceived(const sp<AMessage> &msg) {
  ALOGV("%s %d %d", __FUNCTION__, msg->what(), mState);
  switch (msg->what()) {
    case kWhatStart: {
      status_t err = OK;

      if (mState == UNPREPARED) {
        err = onPrepare();
        if (err == OK) {
          mState = STOPPED;
        }
      }

      if (err == OK) {
        if (mState != STOPPED) {
          err = INVALID_OPERATION;
        } else {
          err = onStart();
          if (err == OK) {
            mState = STARTED;
            notify(MEDIA_STARTED, 0);
          }
        }
      }
      break;
    }
    case kWhatStop: {
      status_t err;

      if (mState != STARTED) {
        err = INVALID_OPERATION;
      } else {
        err = onStop();
        if (err == OK) {
          mState = STOPPED;
          notify(MEDIA_PAUSED, 0);
        }
      }
      break;
    }
    case kWhatDoMoreStuff: {
      int32_t generation = 0;
      msg->findInt32("generation", &generation);

      if (generation != mDoMoreStuffGeneration) {
        ALOGD("Stop called");
        break;
      }

      status_t err = onDoMoreStuff();
      if (err == OK) {
        msg->post(10000ll);
      }
      break;
    }
    case kWhatReset: {
      status_t err = OK;

      if (mState == STARTED) {
        err = onStop();
        if (err == OK) {
          mState = STOPPED;
        }
      }

      if (mState == STOPPED) {
        err = onReset();
        mState = UNPREPARED;
        notify(MEDIA_PLAYBACK_COMPLETE, 0);
      }
      break;
    }
    default:
      ALOGW("Unknown msg type %d", msg->what());
  }
}

status_t StreamPlayer::onPrepare() {
  ALOGV("%s", __FUNCTION__);
  CHECK_EQ(mState, UNPREPARED, "Invalid media state");

  mExtractor = new NuMediaExtractor();
  status_t err = NO_ERROR;
  if (mDataSourceType == DATA_SOURCE_TYPE_BUFFER) {
    err = mExtractor->setDataSource(mBufferedDataSource);
  } else if (mDataSourceType == DATA_SOURCE_TYPE_FILE) {
    err = mExtractor->setDataSource(NULL, mPath.c_str());
  }

  CHECK_EQ(err, (status_t)OK, "Failed to autodetect media content");

  if (mCodecLooper == NULL) {
    mCodecLooper = new ALooper;
    mCodecLooper->start();
  }

  bool haveAudio = false;
  for (size_t i = 0; i < mExtractor->countTracks(); ++i) {
    status_t err = mExtractor->getTrackFormat(i, &mAudioTrackFormat);
    CHECK_EQ(err, (status_t)OK, "Failed to get track format");
    ALOGD("Track format is '%s'", mAudioTrackFormat->debugString(0).c_str());

    int64_t duration;
    if (mAudioTrackFormat->findInt64("durationUs", &duration)) {
      mDurationUs = duration;
    }

    AString mime;
    CHECK(mAudioTrackFormat->findString("mime", &mime), "Failed to get mime type");

    if (!haveAudio && !strncasecmp(mime.c_str(), "audio/", 6)) {
      haveAudio = true;
    } else {
      continue;
    }

    err = mExtractor->selectTrack(i);
    CHECK_EQ(err, (status_t)OK, "Failed to select track");

    mCodecState.mNumFramesWritten = 0;
    mCodecState.mCodec = MediaCodec::CreateByType(
        mCodecLooper, mime.c_str(), false /* encoder */);

    CHECK((mCodecState.mCodec != NULL), "Failed to create media codec");

    err = mCodecState.mCodec->configure(
        mAudioTrackFormat,
        NULL,
        NULL /* crypto */,
        0 /* flags */);

    CHECK_EQ(err, (status_t)OK, "Failed to configure media codec");

    size_t j = 0;
    sp<ABuffer> buffer;
    while (mAudioTrackFormat->findBuffer(AStringPrintf("csd-%d", j).c_str(), &buffer)) {
      mCodecState.mCSD.push_back(buffer);
      ++j;
    }
  }

  CHECK((mCodecState.mCodec != NULL),
        "Failed to create media codec, invalid media content?");

  err = mCodecState.mCodec->start();
  CHECK_EQ(err, (status_t)OK, "Failed to start media codec");

  err = mCodecState.mCodec->getInputBuffers(&mCodecState.mBuffers[0]);
  CHECK_EQ(err, (status_t)OK, "Failed to get input buffers");

  err = mCodecState.mCodec->getOutputBuffers(&mCodecState.mBuffers[1]);
  CHECK_EQ(err, (status_t)OK, "Failed to get output buffers");

  for (size_t j = 0; j < mCodecState.mCSD.size(); ++j) {
    const sp<ABuffer> &srcBuffer = mCodecState.mCSD.itemAt(j);

    size_t index;
    err = mCodecState.mCodec->dequeueInputBuffer(&index, -1ll);
    CHECK_EQ(err, (status_t)OK, "Failed to dequeue input buffers");

    const sp<ABuffer> &dstBuffer = mCodecState.mBuffers[0].itemAt(index);

    CHECK_LE(srcBuffer->size(), dstBuffer->capacity(),
             "Invalid buffer capacity");
    dstBuffer->setRange(0, srcBuffer->size());
    memcpy(dstBuffer->data(), srcBuffer->data(), srcBuffer->size());

    err = mCodecState.mCodec->queueInputBuffer(
        index,
        0,
        dstBuffer->size(),
        0ll,
        MediaCodec::BUFFER_FLAG_CODECCONFIG);
    CHECK_EQ(err, (status_t)OK, "Failed to queue input buffers");
  }

  if (mBufferedDataSource != NULL) {
    mBufferedDataSource->doneSniffing();
  }

  notify(MEDIA_PREPARED, 0);
  return OK;
}

status_t StreamPlayer::onStart() {
  ALOGV("%s", __FUNCTION__);
  CHECK_EQ(mState, STOPPED, "Invalid media state");

  sp<AMessage> msg = getMessage(kWhatDoMoreStuff);
  msg->setInt32("generation", ++mDoMoreStuffGeneration);
  msg->post();

  return OK;
}

status_t StreamPlayer::onStop() {
  ALOGV("%s", __FUNCTION__);
  CHECK_EQ(mState, STARTED, "Invalid media state");

  ++mDoMoreStuffGeneration;

  if (mCodecState.mAudioTrack != NULL) {
    mCodecState.mAudioTrack->pause();
  }

  return OK;
}

status_t StreamPlayer::onReset() {
  ALOGV("%s", __FUNCTION__);
  CHECK_EQ(mState, STOPPED, "Invalid media state");

  if (mCodecState.mCodec != NULL) {
    mCodecState.mCodec->release();
    mCodecState.mCodec.clear();
  }

  mCodecState.mCSD.clear();
  mCodecState.mBuffers[0].clear();
  mCodecState.mBuffers[1].clear();
  mCodecState.mAvailInputBufferIndices.clear();
  mCodecState.mAvailOutputBufferInfos.clear();

  if (mCodecState.mAudioTrack != NULL) {
    mCodecState.mAudioTrack.clear();
  }

  if (mBufferedDataSource != NULL) {
    mBufferedDataSource->reset();
    mBufferedDataSource.clear();
  }

  if (mCodecLooper != NULL) {
    mCodecLooper.clear();
  }

  if (mExtractor != NULL) {
    mExtractor.clear();
  }

  if (mAudioTrackFormat != NULL) {
    mAudioTrackFormat.clear();
  }

  mGain = 1.0;
  return OK;
}

status_t StreamPlayer::onDoMoreStuff() {
  ALOGV("%s", __FUNCTION__);
  status_t err;
  do {
    size_t index;
    err = mCodecState.mCodec->dequeueInputBuffer(&index);

    if (err == OK) {
      ALOGV("dequeued input buffer");

      mCodecState.mAvailInputBufferIndices.push_back(index);
    } else {
      ALOGV("dequeueInputBuffer returned %d", err);
    }
  } while (err == OK);

  do {
    BufferInfo info;
    err = mCodecState.mCodec->dequeueOutputBuffer(
        &info.mIndex,
        &info.mOffset,
        &info.mSize,
        &info.mPresentationTimeUs,
        &info.mFlags);

    if (err == OK) {
      ALOGV("dequeued output buffer");
      mCodecState.mBytesToPlay = mCodecState.mBytesToPlay + info.mSize;
      mCodecState.mAvailOutputBufferInfos.push_back(info);
    } else if (err == INFO_FORMAT_CHANGED) {
      err = onOutputFormatChanged();
      CHECK_EQ(err, (status_t)OK, "Failed to get output format");
    } else if (err == INFO_OUTPUT_BUFFERS_CHANGED) {
      err = mCodecState.mCodec->getOutputBuffers(&mCodecState.mBuffers[1]);
      CHECK_EQ(err, (status_t)OK, "Failed to get output buffers");
    } else {
      ALOGV("dequeueOutputBuffer returned %d", err);
    }
  } while (err == OK || err == INFO_FORMAT_CHANGED ||
           err == INFO_OUTPUT_BUFFERS_CHANGED);

  for (;;) {
    size_t trackIndex;
    status_t err = mExtractor->getSampleTrackIndex(&trackIndex);

    if (err == ERROR_END_OF_STREAM) {
      ALOGV("encountered input EOS, total Size %llu", mCodecState.mBytesToPlay);
      if (mCodecState.mAudioTrack != NULL) {
        ALOGV("Frame size %d", mCodecState.mAudioTrack->frameSize());
        uint32_t numSamples =
          mCodecState.mBytesToPlay /
          mCodecState.mAudioTrack->frameSize();
        ALOGV("Setting marker position to %d", numSamples);
        mCodecState.mAudioTrack->setMarkerPosition(numSamples);
      }
      break;
    } else if (err != OK) {
      ALOGE("error %d", err);
      notify(MEDIA_ERROR, "Unknown media error");
      break;
    } else {
      if (mCodecState.mAvailInputBufferIndices.empty()) {
        break;
      }

      size_t index = *mCodecState.mAvailInputBufferIndices.begin();
      mCodecState.mAvailInputBufferIndices.erase(
          mCodecState.mAvailInputBufferIndices.begin());

      const sp<ABuffer> &dstBuffer =
          mCodecState.mBuffers[0].itemAt(index);

      err = mExtractor->readSampleData(dstBuffer);
      CHECK_EQ(err, (status_t)OK, "Failed to read more data");

      int64_t timeUs;
      CHECK_EQ(mExtractor->getSampleTime(&timeUs), (status_t)OK,
               "Failed to get sample time");

      err = mCodecState.mCodec->queueInputBuffer(
          index,
          dstBuffer->offset(),
          dstBuffer->size(),
          timeUs,
          0);
      CHECK_EQ(err, (status_t)OK, "Failed to queue input buffers");

      ALOGV("enqueued input data on track %d", trackIndex);

      err = mExtractor->advance();
      CHECK_EQ(err, (status_t)OK, "Failed to read more data");
    }
  }

  while (!mCodecState.mAvailOutputBufferInfos.empty()) {
    BufferInfo *info = &*mCodecState.mAvailOutputBufferInfos.begin();

    bool release = true;

    if (mCodecState.mAudioTrack != NULL) {
      const sp<ABuffer> &srcBuffer =
          mCodecState.mBuffers[1].itemAt(info->mIndex);

      renderAudio(info, srcBuffer);

      if (info->mSize > 0) {
        release = false;
      }

      if (release) {
        mCodecState.mCodec->renderOutputBufferAndRelease(
            info->mIndex);
      }
    }

    if (release) {
      mCodecState.mAvailOutputBufferInfos.erase(
          mCodecState.mAvailOutputBufferInfos.begin());

      info = NULL;
    } else {
      break;
    }
  }

  ALOGV("Done onDoMoreStuff");
  return OK;
}

status_t StreamPlayer::onOutputFormatChanged() {
  ALOGV("%s", __FUNCTION__);
  sp<AMessage> format;
  status_t err = mCodecState.mCodec->getOutputFormat(&format);
  if (err != OK) {
    return err;
  }

  AString mime;
  CHECK(format->findString("mime", &mime), "Failed to get mime type");

  if (!strncasecmp(mime.c_str(), "audio/", 6)) {
    int32_t channelCount;
    int32_t sampleRate;
    CHECK(format->findInt32("channel-count", &channelCount),
          "Failed to get channel count");
    CHECK(format->findInt32("sample-rate", &sampleRate),
          "Failed to get sample rate");

    // Get bits per sample for AudioFormat if available. Only applicable to
    // wav files. For all other format the default of 16 is used.
    int32_t bitsPerSample = 16; // Default to 16 bit PCM
    mAudioTrackFormat->findInt32("bits-per-sample", &bitsPerSample);
    ALOGV("bitsPerSample %d", bitsPerSample);

    audio_format_t format;
    switch(bitsPerSample) {
      case 8:
        format = AUDIO_FORMAT_PCM_8_BIT;
        break;
      case 16:
        format = AUDIO_FORMAT_PCM_16_BIT;
        break;
      case 24:
        format = AUDIO_FORMAT_PCM_24_BIT_PACKED;
        break;
      case 32:
        format = AUDIO_FORMAT_PCM_32_BIT;
        break;
      default:
        ALOGD("Bit depth of %d not supported", bitsPerSample);
        CHECK(false, "Unsupported bit depth");
    }

    ALOGD("format %d", format);
    mCodecState.mAudioTrack = new AudioTrack();
    mCodecState.mAudioTrack->set(
      AUDIO_STREAM_DEFAULT,
      sampleRate,
      format,
      audio_channel_out_mask_from_count(channelCount),
      0,
      AUDIO_OUTPUT_FLAG_NONE,
      audioCallback,
      this,
      0,
      0,
      false,
      AUDIO_SESSION_ALLOCATE,
      AudioTrack::TRANSFER_SYNC,
      NULL,
      -1,
      -1,
      NULL
    );
    mCodecState.mNumFramesWritten = 0;
    mCodecState.mBytesToPlay = 0;
  }

  return OK;
}

status_t StreamPlayer::renderAudio(BufferInfo *info, const sp<ABuffer> &buffer) {
  ALOGV("%s", __FUNCTION__);
  CHECK((mCodecState.mAudioTrack != NULL), "Failed to get audio track");

  if (mCodecState.mAudioTrack->stopped()) {
    mCodecState.mAudioTrack->setVolume(mGain);
    mCodecState.mAudioTrack->start();
  }

  uint32_t numFramesPlayed;
  CHECK_EQ(mCodecState.mAudioTrack->getPosition(&numFramesPlayed), (status_t)OK,
           "Failed to get position of audio track");

  uint32_t numFramesAvailableToWrite =
      mCodecState.mAudioTrack->frameCount()
      - (mCodecState.mNumFramesWritten - numFramesPlayed);

  size_t numBytesAvailableToWrite =
      numFramesAvailableToWrite * mCodecState.mAudioTrack->frameSize();

  size_t copy = info->mSize;
  if (copy > numBytesAvailableToWrite) {
    copy = numBytesAvailableToWrite;
  }

  if (copy == 0) {
    return OK;
  }

  int64_t startTimeUs = ALooper::GetNowUs();

  ssize_t nbytes = mCodecState.mAudioTrack->write(
      buffer->base() + info->mOffset, copy);

  CHECK_EQ(nbytes, (ssize_t)copy, "Failed to write data to audio track");

  int64_t delayUs = ALooper::GetNowUs() - startTimeUs;

  uint32_t numFramesWritten = nbytes / mCodecState.mAudioTrack->frameSize();

  if (delayUs > 2000ll) {
    ALOGW("AudioTrack::write took %lld us, numFramesAvailableToWrite=%u, "
        "numFramesWritten=%u",
        delayUs, numFramesAvailableToWrite, numFramesWritten);
  }

  info->mOffset += nbytes;
  info->mSize -= nbytes;

  mCodecState.mNumFramesWritten += numFramesWritten;
  return OK;
}

AMessage* StreamPlayer::getMessage(uint32_t what) {
#ifdef TARGET_GE_MARSHMALLOW
  return new AMessage(what, this);
#else
  return new AMessage(what, id());
#endif
}

}  // namespace android
