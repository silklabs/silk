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

#include <media/AudioTrack.h>
#include <media/ICrypto.h>
#include <media/IMediaHTTPService.h>
#include <media/stagefright/foundation/ABuffer.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/foundation/AMessage.h>
#include <media/stagefright/MediaCodec.h>
#include <media/stagefright/MediaErrors.h>
#include <media/stagefright/NativeWindowWrapper.h>
#include <media/stagefright/NuMediaExtractor.h>
#include <media/stagefright/Utils.h>
#include <media/stagefright/MetaData.h>
#include <media/stagefright/MediaDefs.h>
#include <media/stagefright/FileSource.h>

#define BUF_SIZE 8192

namespace android {

StreamPlayer::StreamPlayer() :
    mState(UNPREPARED),
    mDoMoreStuffGeneration(0),
    mStartTimeRealUs(-1ll) {
  bufferedDataSource = new BufferedDataSource();
  ALOGV("Finished initializing StreamPlayer");
}

StreamPlayer::~StreamPlayer(){
  ALOGV("Exiting StreamPlayer");
}

/**
 * Write the audio buffer to the BufferedDataSource to be played
 */
int StreamPlayer::write(const void* bytes, size_t size) {
  // ALOGV("%s", __FUNCTION__);
  sp<ABuffer> abuffer = ABuffer::CreateAsCopy(bytes, size);
  if (abuffer != NULL) {
    bufferedDataSource->queueBuffer(abuffer);
    return size;
  }
  return 0;
}

/**
 * Set stream volume (gain)
 */
void StreamPlayer::setVolume(float gain) {
  ALOGD("Audio player setting volume %f", gain);
  for (size_t i = 0; i < mStateByTrackIndex.size(); ++i) {
    CodecState *state = &mStateByTrackIndex.editValueAt(i);
    if ((state != NULL) && (state->mAudioTrack != NULL)) {
      state->mAudioTrack->setVolume(gain);
    }
  }
}

// static
status_t PostAndAwaitResponse(
    const sp<AMessage> &msg, sp<AMessage> *response) {
  ALOGV("%s", __FUNCTION__);
  status_t err = msg->postAndAwaitResponse(response);

  if (err != OK) {
    return err;
  }

  if (!(*response)->findInt32("err", &err)) {
    err = OK;
  }

  return err;
}

status_t StreamPlayer::start() {
  ALOGV("%s", __FUNCTION__);
  sp<AMessage> msg = new AMessage(kWhatStart, id());
  sp<AMessage> response;
  return PostAndAwaitResponse(msg, &response);
}

status_t StreamPlayer::stop() {
  ALOGV("%s", __FUNCTION__);

  bufferedDataSource->queueEOS(ERROR_END_OF_STREAM);

  sp<AMessage> msg = new AMessage(kWhatStop, id());
  sp<AMessage> response;
  return PostAndAwaitResponse(msg, &response);
}

void StreamPlayer::onMessageReceived(const sp<AMessage> &msg) {
  ALOGV("%s %d", __FUNCTION__, msg->what());
  switch (msg->what()) {
    case kWhatPrepare: {
      status_t err;

      if (mState != UNPREPARED) {
        err = INVALID_OPERATION;
      } else {
        err = onPrepare();
        if (err == OK) {
          mState = STOPPED;
        }
      }

      uint32_t replyID;
      CHECK(msg->senderAwaitsResponse(&replyID));

      sp<AMessage> response = new AMessage;
      response->setInt32("err", err);
      response->postReply(replyID);
      break;
    }
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
          }
        }
      }

      uint32_t replyID;
      CHECK(msg->senderAwaitsResponse(&replyID));

      sp<AMessage> response = new AMessage;
      response->setInt32("err", err);
      response->postReply(replyID);
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
        }
      }

      uint32_t replyID;
      CHECK(msg->senderAwaitsResponse(&replyID));

      sp<AMessage> response = new AMessage;
      response->setInt32("err", err);
      response->postReply(replyID);
      break;
    }
    case kWhatDoMoreStuff: {
      int32_t generation;
      CHECK(msg->findInt32("generation", &generation));

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
    default:
      ALOGW("Unknown msg type %d", msg->what());
  }
}

status_t StreamPlayer::onPrepare() {
  CHECK_EQ(mState, UNPREPARED);

  mExtractor = new NuMediaExtractor;
  status_t err = mExtractor->setDataSource(bufferedDataSource);
  if (err != OK) {
    ALOGE("Failed to add data source %d", err);
    mExtractor.clear();
    return err;
  }

  if (mCodecLooper == NULL) {
    mCodecLooper = new ALooper;
    mCodecLooper->start();
  }

  bool haveAudio = false;
  for (size_t i = 0; i < mExtractor->countTracks(); ++i) {
    sp<AMessage> formatFile;
    status_t err = mExtractor->getTrackFormat(i, &formatFile);
    CHECK_EQ(err, (status_t)OK);
    ALOGD("Track format is '%s'", formatFile->debugString(0).c_str());

    AString mime;
    CHECK(formatFile->findString("mime", &mime));

    if (!haveAudio && !strncasecmp(mime.c_str(), "audio/", 6)) {
      haveAudio = true;
    } else {
      continue;
    }

    err = mExtractor->selectTrack(i);
    CHECK_EQ(err, (status_t)OK);

    CodecState *state =
        &mStateByTrackIndex.editValueAt(
            mStateByTrackIndex.add(i, CodecState()));

    state->mNumFramesWritten = 0;
    state->mCodec = MediaCodec::CreateByType(
        mCodecLooper, mime.c_str(), false /* encoder */);

    CHECK(state->mCodec != NULL);

    err = state->mCodec->configure(
        formatFile,
        NULL,
        NULL /* crypto */,
        0 /* flags */);

    CHECK_EQ(err, (status_t)OK);

    size_t j = 0;
    sp<ABuffer> buffer;
    while (formatFile->findBuffer(StringPrintf("csd-%d", j).c_str(), &buffer)) {
      state->mCSD.push_back(buffer);
      ++j;
    }
  }

  for (size_t i = 0; i < mStateByTrackIndex.size(); ++i) {
    CodecState *state = &mStateByTrackIndex.editValueAt(i);

    status_t err = state->mCodec->start();
    CHECK_EQ(err, (status_t)OK);

    err = state->mCodec->getInputBuffers(&state->mBuffers[0]);
    CHECK_EQ(err, (status_t)OK);

    err = state->mCodec->getOutputBuffers(&state->mBuffers[1]);
    CHECK_EQ(err, (status_t)OK);

    for (size_t j = 0; j < state->mCSD.size(); ++j) {
      const sp<ABuffer> &srcBuffer = state->mCSD.itemAt(j);

      size_t index;
      err = state->mCodec->dequeueInputBuffer(&index, -1ll);
      CHECK_EQ(err, (status_t)OK);

      const sp<ABuffer> &dstBuffer = state->mBuffers[0].itemAt(index);

      CHECK_LE(srcBuffer->size(), dstBuffer->capacity());
      dstBuffer->setRange(0, srcBuffer->size());
      memcpy(dstBuffer->data(), srcBuffer->data(), srcBuffer->size());

      err = state->mCodec->queueInputBuffer(
          index,
          0,
          dstBuffer->size(),
          0ll,
          MediaCodec::BUFFER_FLAG_CODECCONFIG);
      CHECK_EQ(err, (status_t)OK);
    }
  }

  bufferedDataSource->doneSniffing();
  return OK;
}

status_t StreamPlayer::onStart() {
  ALOGV("%s", __FUNCTION__);
  CHECK_EQ(mState, STOPPED);

  mStartTimeRealUs = -1ll;

  sp<AMessage> msg = new AMessage(kWhatDoMoreStuff, id());
  msg->setInt32("generation", ++mDoMoreStuffGeneration);
  msg->post();

  return OK;
}

status_t StreamPlayer::onStop() {
  ALOGV("%s", __FUNCTION__);
  CHECK_EQ(mState, STARTED);

  ++mDoMoreStuffGeneration;

  return OK;
}

status_t StreamPlayer::onDoMoreStuff() {
  ALOGV("%s", __FUNCTION__);
  for (size_t i = 0; i < mStateByTrackIndex.size(); ++i) {
    CodecState *state = &mStateByTrackIndex.editValueAt(i);

    status_t err;
    do {
      size_t index;
      err = state->mCodec->dequeueInputBuffer(&index);

      if (err == OK) {
        ALOGV("dequeued input buffer on track %d",
              mStateByTrackIndex.keyAt(i));

        state->mAvailInputBufferIndices.push_back(index);
      } else {
        ALOGV("dequeueInputBuffer on track %d returned %d",
              mStateByTrackIndex.keyAt(i), err);
      }
    } while (err == OK);

    do {
      BufferInfo info;
      err = state->mCodec->dequeueOutputBuffer(
          &info.mIndex,
          &info.mOffset,
          &info.mSize,
          &info.mPresentationTimeUs,
          &info.mFlags);

      if (err == OK) {
        ALOGV("dequeued output buffer on track %d",
              mStateByTrackIndex.keyAt(i));

        state->mAvailOutputBufferInfos.push_back(info);
      } else if (err == INFO_FORMAT_CHANGED) {
        err = onOutputFormatChanged(mStateByTrackIndex.keyAt(i), state);
        CHECK_EQ(err, (status_t)OK);
      } else if (err == INFO_OUTPUT_BUFFERS_CHANGED) {
        err = state->mCodec->getOutputBuffers(&state->mBuffers[1]);
        CHECK_EQ(err, (status_t)OK);
      } else {
        ALOGV("dequeueOutputBuffer on track %d returned %d",
              mStateByTrackIndex.keyAt(i), err);
      }
    } while (err == OK || err == INFO_FORMAT_CHANGED || err == INFO_OUTPUT_BUFFERS_CHANGED);
  }

  for (;;) {
    size_t trackIndex;
    status_t err = mExtractor->getSampleTrackIndex(&trackIndex);

    if (err != OK) {
      ALOGI("encountered input EOS.");
      break;
    } else {
      CodecState *state = &mStateByTrackIndex.editValueFor(trackIndex);

      if (state->mAvailInputBufferIndices.empty()) {
        break;
      }

      size_t index = *state->mAvailInputBufferIndices.begin();
      state->mAvailInputBufferIndices.erase(
          state->mAvailInputBufferIndices.begin());

      const sp<ABuffer> &dstBuffer =
          state->mBuffers[0].itemAt(index);

      err = mExtractor->readSampleData(dstBuffer);
      CHECK_EQ(err, (status_t)OK);

      int64_t timeUs;
      CHECK_EQ(mExtractor->getSampleTime(&timeUs), (status_t)OK);

      err = state->mCodec->queueInputBuffer(
          index,
          dstBuffer->offset(),
          dstBuffer->size(),
          timeUs,
          0);
      CHECK_EQ(err, (status_t)OK);

      ALOGV("enqueued input data on track %d", trackIndex);

      err = mExtractor->advance();
      CHECK_EQ(err, (status_t)OK);
    }
  }

  int64_t nowUs = ALooper::GetNowUs();

  if (mStartTimeRealUs < 0ll) {
    mStartTimeRealUs = nowUs + 1000000ll;
  }

  for (size_t i = 0; i < mStateByTrackIndex.size(); ++i) {
    CodecState *state = &mStateByTrackIndex.editValueAt(i);

    while (!state->mAvailOutputBufferInfos.empty()) {
      BufferInfo *info = &*state->mAvailOutputBufferInfos.begin();

      int64_t whenRealUs = info->mPresentationTimeUs + mStartTimeRealUs;
      int64_t lateByUs = nowUs - whenRealUs;

      if (lateByUs > -10000ll) {
        bool release = true;

        if (lateByUs > 30000ll) {
          ALOGI("track %d buffer late by %lld us, dropping.",
                mStateByTrackIndex.keyAt(i), lateByUs);
          state->mCodec->releaseOutputBuffer(info->mIndex);
        } else {
          if (state->mAudioTrack != NULL) {
            const sp<ABuffer> &srcBuffer =
                state->mBuffers[1].itemAt(info->mIndex);

            renderAudio(state, info, srcBuffer);

            if (info->mSize > 0) {
              release = false;
            }
          }

          if (release) {
            state->mCodec->renderOutputBufferAndRelease(
                info->mIndex);
          }
        }

        if (release) {
          state->mAvailOutputBufferInfos.erase(
              state->mAvailOutputBufferInfos.begin());

          info = NULL;
        } else {
          break;
        }
      } else {
        ALOGV("track %d buffer early by %lld us.",
              mStateByTrackIndex.keyAt(i), -lateByUs);
        break;
      }
    }
  }

  ALOGV("Done onDoMoreStuff");
  return OK;
}

status_t StreamPlayer::onOutputFormatChanged(
    size_t trackIndex, CodecState *state) {
  ALOGV("%s", __FUNCTION__);
  sp<AMessage> format;
  status_t err = state->mCodec->getOutputFormat(&format);

  if (err != OK) {
    return err;
  }

  AString mime;
  CHECK(format->findString("mime", &mime));

  if (!strncasecmp(mime.c_str(), "audio/", 6)) {
    int32_t channelCount;
    int32_t sampleRate;
    CHECK(format->findInt32("channel-count", &channelCount));
    CHECK(format->findInt32("sample-rate", &sampleRate));

    state->mAudioTrack = new AudioTrack(
        AUDIO_STREAM_MUSIC,
        sampleRate,
        AUDIO_FORMAT_PCM_16_BIT,
        audio_channel_out_mask_from_count(channelCount),
        0);

    state->mNumFramesWritten = 0;
  }

  return OK;
}

void StreamPlayer::renderAudio(
    CodecState *state, BufferInfo *info, const sp<ABuffer> &buffer) {
  ALOGV("%s", __FUNCTION__);
  CHECK(state->mAudioTrack != NULL);

  if (state->mAudioTrack->stopped()) {
    state->mAudioTrack->start();
  }

  uint32_t numFramesPlayed;
  CHECK_EQ(state->mAudioTrack->getPosition(&numFramesPlayed), (status_t)OK);

  uint32_t numFramesAvailableToWrite =
      state->mAudioTrack->frameCount()
      - (state->mNumFramesWritten - numFramesPlayed);

  size_t numBytesAvailableToWrite =
      numFramesAvailableToWrite * state->mAudioTrack->frameSize();

  size_t copy = info->mSize;
  if (copy > numBytesAvailableToWrite) {
    copy = numBytesAvailableToWrite;
  }

  if (copy == 0) {
    return;
  }

  int64_t startTimeUs = ALooper::GetNowUs();

  ssize_t nbytes = state->mAudioTrack->write(
      buffer->base() + info->mOffset, copy);

  CHECK_EQ(nbytes, (ssize_t)copy);

  int64_t delayUs = ALooper::GetNowUs() - startTimeUs;

  uint32_t numFramesWritten = nbytes / state->mAudioTrack->frameSize();

  if (delayUs > 2000ll) {
    ALOGW("AudioTrack::write took %lld us, numFramesAvailableToWrite=%u, "
        "numFramesWritten=%u",
        delayUs, numFramesAvailableToWrite, numFramesWritten);
  }

  info->mOffset += nbytes;
  info->mSize -= nbytes;

  state->mNumFramesWritten += numFramesWritten;
}

}  // namespace android
