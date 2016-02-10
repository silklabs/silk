/*
 * Copyright 2014, The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "MediaCodecSource"
#define DEBUG_DRIFT_TIME 0

#include <inttypes.h>

#include <gui/IGraphicBufferProducer.h>
#include <gui/Surface.h>
#include <media/ICrypto.h>
#include <media/stagefright/foundation/ABuffer.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/foundation/ALooper.h>
#include <media/stagefright/foundation/AMessage.h>
#include <media/stagefright/MediaBuffer.h>
#include <media/stagefright/MediaCodec.h>
#include <media/stagefright/MetaData.h>
#include <media/stagefright/MediaErrors.h>
#include <media/stagefright/MediaSource.h>
#include <media/stagefright/MediaCodecSource.h>
#include <media/stagefright/Utils.h>

namespace android {

struct MediaCodecSource::Puller : public AHandler {
    Puller(const sp<MediaSource> &source);

    status_t start(const sp<MetaData> &meta, const sp<AMessage> &notify);
    void stop();

    void pause();
    void resume();

protected:
    virtual void onMessageReceived(const sp<AMessage> &msg);
    virtual ~Puller();

private:
    enum {
        kWhatStart = 'msta',
        kWhatStop,
        kWhatPull,
        kWhatPause,
        kWhatResume,
    };

    sp<MediaSource> mSource;
    sp<AMessage> mNotify;
    sp<ALooper> mLooper;
    int32_t mPullGeneration;
    bool mIsAudio;
    bool mPaused;
    bool mReachedEOS;

    status_t postSynchronouslyAndReturnError(const sp<AMessage> &msg);
    void schedulePull();
    void handleEOS();

    DISALLOW_EVIL_CONSTRUCTORS(Puller);
};

MediaCodecSource::Puller::Puller(const sp<MediaSource> &source)
    : mSource(source),
      mLooper(new ALooper()),
      mPullGeneration(0),
      mIsAudio(false),
      mPaused(false),
      mReachedEOS(false) {
    sp<MetaData> meta = source->getFormat();
    const char *mime;
    CHECK(meta->findCString(kKeyMIMEType, &mime));

    mIsAudio = !strncasecmp(mime, "audio/", 6);

    mLooper->setName("pull_looper");
}

MediaCodecSource::Puller::~Puller() {
    mLooper->unregisterHandler(id());
    mLooper->stop();
}

status_t MediaCodecSource::Puller::postSynchronouslyAndReturnError(
        const sp<AMessage> &msg) {
    sp<AMessage> response;
    status_t err = msg->postAndAwaitResponse(&response);

    if (err != OK) {
        return err;
    }

    if (!response->findInt32("err", &err)) {
        err = OK;
    }

    return err;
}

status_t MediaCodecSource::Puller::start(const sp<MetaData> &meta,
        const sp<AMessage> &notify) {
    ALOGV("puller (%s) start", mIsAudio ? "audio" : "video");
    mLooper->start(
            false /* runOnCallingThread */,
            false /* canCallJava */,
            PRIORITY_AUDIO);
    mLooper->registerHandler(this);
    mNotify = notify;

    sp<AMessage> msg = new AMessage(kWhatStart, id());
    msg->setObject("meta", meta);
    return postSynchronouslyAndReturnError(msg);
}

void MediaCodecSource::Puller::stop() {
    // Stop source from caller's thread instead of puller's looper.
    // mSource->stop() is thread-safe, doing it outside the puller's
    // looper allows us to at least stop if source gets stuck.
    // If source gets stuck in read(), the looper would never
    // be able to process the stop(), which could lead to ANR.

    ALOGV("source (%s) stopping", mIsAudio ? "audio" : "video");
    mSource->stop();
    ALOGV("source (%s) stopped", mIsAudio ? "audio" : "video");

    (new AMessage(kWhatStop, id()))->post();
}

void MediaCodecSource::Puller::pause() {
    (new AMessage(kWhatPause, id()))->post();
}

void MediaCodecSource::Puller::resume() {
    (new AMessage(kWhatResume, id()))->post();
}

void MediaCodecSource::Puller::schedulePull() {
    sp<AMessage> msg = new AMessage(kWhatPull, id());
    msg->setInt32("generation", mPullGeneration);
    msg->post();
}

void MediaCodecSource::Puller::handleEOS() {
    if (!mReachedEOS) {
        ALOGV("puller (%s) posting EOS", mIsAudio ? "audio" : "video");
        mReachedEOS = true;
        sp<AMessage> notify = mNotify->dup();
        notify->setPointer("accessUnit", NULL);
        notify->post();
    }
}

void MediaCodecSource::Puller::onMessageReceived(const sp<AMessage> &msg) {
    switch (msg->what()) {
        case kWhatStart:
        {
            sp<RefBase> obj;
            CHECK(msg->findObject("meta", &obj));

            mReachedEOS = false;

            status_t err = mSource->start(static_cast<MetaData *>(obj.get()));

            if (err == OK) {
                schedulePull();
            }

            sp<AMessage> response = new AMessage;
            response->setInt32("err", err);

            uint32_t replyID;
            CHECK(msg->senderAwaitsResponse(&replyID));
            response->postReply(replyID);
            break;
        }

        case kWhatStop:
        {
            ++mPullGeneration;

            handleEOS();
            break;
        }

        case kWhatPull:
        {
            int32_t generation;
            CHECK(msg->findInt32("generation", &generation));

            if (generation != mPullGeneration) {
                break;
            }

            MediaBuffer *mbuf;
            status_t err = mSource->read(&mbuf);

            if (mPaused) {
                if (err == OK) {
                    mbuf->release();
                    mbuf = NULL;
                }

                msg->post();
                break;
            }

            if (err != OK) {
                if (err == ERROR_END_OF_STREAM) {
                    ALOGV("stream ended, mbuf %p", mbuf);
                } else {
                    ALOGE("error %d reading stream.", err);
                }
                handleEOS();
            } else {
                sp<AMessage> notify = mNotify->dup();

                notify->setPointer("accessUnit", mbuf);
                notify->post();

                msg->post();
            }
            break;
        }

        case kWhatPause:
        {
            mPaused = true;
            break;
        }

        case kWhatResume:
        {
            mPaused = false;
            break;
        }

        default:
            TRESPASS();
    }
}

// static
sp<MediaCodecSource> MediaCodecSource::Create(
        const sp<ALooper> &looper,
        const sp<AMessage> &format,
        const sp<MediaSource> &source,
        uint32_t flags) {
    sp<MediaCodecSource> mediaSource =
            new MediaCodecSource(looper, format, source, flags);

    if (mediaSource->init() == OK) {
        return mediaSource;
    }
    return NULL;
}

status_t MediaCodecSource::start(MetaData* params) {
    sp<AMessage> msg = new AMessage(kWhatStart, mReflector->id());
    msg->setObject("meta", params);
    return postSynchronouslyAndReturnError(msg);
}

status_t MediaCodecSource::stop() {
    sp<AMessage> msg = new AMessage(kWhatStop, mReflector->id());
    status_t err = postSynchronouslyAndReturnError(msg);

    // mPuller->stop() needs to be done outside MediaCodecSource's looper,
    // as it contains a synchronous call to stop the underlying MediaSource,
    // which often waits for all outstanding MediaBuffers to return, but
    // MediaBuffers are only returned when MediaCodecSource looper gets
    // to process them.

    if (mPuller != NULL) {
        ALOGI("puller (%s) stopping", mIsVideo ? "video" : "audio");
        mPuller->stop();
        ALOGI("puller (%s) stopped", mIsVideo ? "video" : "audio");
    }

    return err;
}

status_t MediaCodecSource::pause() {
    (new AMessage(kWhatPause, mReflector->id()))->post();
    return OK;
}

sp<IGraphicBufferProducer> MediaCodecSource::getGraphicBufferProducer() {
    CHECK(mFlags & FLAG_USE_SURFACE_INPUT);
    return mGraphicBufferProducer;
}

status_t MediaCodecSource::read(
        MediaBuffer** buffer, const ReadOptions* /* options */) {
    Mutex::Autolock autolock(mOutputBufferLock);

    *buffer = NULL;
    while (mOutputBufferQueue.size() == 0 && !mEncoderReachedEOS) {
        mOutputBufferCond.wait(mOutputBufferLock);
    }
    if (!mEncoderReachedEOS) {
        *buffer = *mOutputBufferQueue.begin();
        mOutputBufferQueue.erase(mOutputBufferQueue.begin());
        return OK;
    }
    return mErrorCode;
}

void MediaCodecSource::signalBufferReturned(MediaBuffer *buffer) {
    buffer->setObserver(0);
    buffer->release();
}

MediaCodecSource::MediaCodecSource(
        const sp<ALooper> &looper,
        const sp<AMessage> &outputFormat,
        const sp<MediaSource> &source,
        uint32_t flags)
    : mLooper(looper),
      mOutputFormat(outputFormat),
      mMeta(new MetaData),
      mFlags(flags),
      mIsVideo(false),
      mStarted(false),
      mStopping(false),
      mDoMoreWorkPending(false),
      mFirstSampleTimeUs(-1ll),
      mEncoderReachedEOS(false),
      mErrorCode(OK) {
    CHECK(mLooper != NULL);

    AString mime;
    CHECK(mOutputFormat->findString("mime", &mime));

    if (!strncasecmp("video/", mime.c_str(), 6)) {
        mIsVideo = true;
    }

    if (!(mFlags & FLAG_USE_SURFACE_INPUT)) {
        mPuller = new Puller(source);
    }
}

MediaCodecSource::~MediaCodecSource() {
    releaseEncoder();

    mCodecLooper->stop();
    mLooper->unregisterHandler(mReflector->id());
}

status_t MediaCodecSource::init() {
    status_t err = initEncoder();

    if (err != OK) {
        releaseEncoder();
    }

    return err;
}

status_t MediaCodecSource::initEncoder() {
    mReflector = new AHandlerReflector<MediaCodecSource>(this);
    mLooper->registerHandler(mReflector);

    mCodecLooper = new ALooper;
    mCodecLooper->setName("codec_looper");
    mCodecLooper->start();

    if (mFlags & FLAG_USE_METADATA_INPUT) {
        mOutputFormat->setInt32("store-metadata-in-buffers", 1);
    }

    if (mFlags & FLAG_USE_SURFACE_INPUT) {
        mOutputFormat->setInt32("create-input-buffers-suspended", 1);
    }

    AString outputMIME;
    CHECK(mOutputFormat->findString("mime", &outputMIME));

    mEncoder = MediaCodec::CreateByType(
            mCodecLooper, outputMIME.c_str(), true /* encoder */);

    if (mEncoder == NULL) {
        return NO_INIT;
    }

    ALOGV("output format is '%s'", mOutputFormat->debugString(0).c_str());

    status_t err = mEncoder->configure(
                mOutputFormat,
                NULL /* nativeWindow */,
                NULL /* crypto */,
                MediaCodec::CONFIGURE_FLAG_ENCODE);

    if (err != OK) {
        return err;
    }

    mEncoder->getOutputFormat(&mOutputFormat);
    convertMessageToMetaData(mOutputFormat, mMeta);

    if (mFlags & FLAG_USE_SURFACE_INPUT) {
        CHECK(mIsVideo);

        err = mEncoder->createInputSurface(&mGraphicBufferProducer);

        if (err != OK) {
            return err;
        }
    }

    mEncoderActivityNotify = new AMessage(
            kWhatEncoderActivity, mReflector->id());
    mEncoder->setCallback(mEncoderActivityNotify);

    err = mEncoder->start();

    if (err != OK) {
        return err;
    }

    mEncoderReachedEOS = false;
    mErrorCode = OK;

    return OK;
}

void MediaCodecSource::releaseEncoder() {
    if (mEncoder == NULL) {
        return;
    }

    mEncoder->release();
    mEncoder.clear();

    while (!mInputBufferQueue.empty()) {
        MediaBuffer *mbuf = *mInputBufferQueue.begin();
        mInputBufferQueue.erase(mInputBufferQueue.begin());
        if (mbuf != NULL) {
            mbuf->release();
        }
    }
}

status_t MediaCodecSource::postSynchronouslyAndReturnError(
        const sp<AMessage> &msg) {
    sp<AMessage> response;
    status_t err = msg->postAndAwaitResponse(&response);

    if (err != OK) {
        return err;
    }

    if (!response->findInt32("err", &err)) {
        err = OK;
    }

    return err;
}

void MediaCodecSource::signalEOS(status_t err) {
    if (!mEncoderReachedEOS) {
        ALOGV("encoder (%s) reached EOS", mIsVideo ? "video" : "audio");
        {
            Mutex::Autolock autoLock(mOutputBufferLock);
            // release all unread media buffers
            for (List<MediaBuffer*>::iterator it = mOutputBufferQueue.begin();
                    it != mOutputBufferQueue.end(); it++) {
                (*it)->release();
            }
            mOutputBufferQueue.clear();
            mEncoderReachedEOS = true;
            mErrorCode = err;
            mOutputBufferCond.signal();
        }

        releaseEncoder();
    }
    if (mStopping && mEncoderReachedEOS) {
        ALOGI("encoder (%s) stopped", mIsVideo ? "video" : "audio");
        // posting reply to everyone that's waiting
        List<uint32_t>::iterator it;
        for (it = mStopReplyIDQueue.begin();
                it != mStopReplyIDQueue.end(); it++) {
            (new AMessage)->postReply(*it);
        }
        mStopReplyIDQueue.clear();
        mStopping = false;
    }
}

void MediaCodecSource::suspend() {
    CHECK(mFlags & FLAG_USE_SURFACE_INPUT);
    if (mEncoder != NULL) {
        sp<AMessage> params = new AMessage;
        params->setInt32("drop-input-frames", true);
        mEncoder->setParameters(params);
    }
}

void MediaCodecSource::resume(int64_t skipFramesBeforeUs) {
    CHECK(mFlags & FLAG_USE_SURFACE_INPUT);
    if (mEncoder != NULL) {
        sp<AMessage> params = new AMessage;
        params->setInt32("drop-input-frames", false);
        if (skipFramesBeforeUs > 0) {
            params->setInt64("skip-frames-before", skipFramesBeforeUs);
        }
        mEncoder->setParameters(params);
    }
}

status_t MediaCodecSource::feedEncoderInputBuffers() {
    while (!mInputBufferQueue.empty()
            && !mAvailEncoderInputIndices.empty()) {
        MediaBuffer* mbuf = *mInputBufferQueue.begin();
        mInputBufferQueue.erase(mInputBufferQueue.begin());

        size_t bufferIndex = *mAvailEncoderInputIndices.begin();
        mAvailEncoderInputIndices.erase(mAvailEncoderInputIndices.begin());

        int64_t timeUs = 0ll;
        uint32_t flags = 0;
        size_t size = 0;

        if (mbuf != NULL) {
            CHECK(mbuf->meta_data()->findInt64(kKeyTime, &timeUs));

            // push decoding time for video, or drift time for audio
            if (mIsVideo) {
                mDecodingTimeQueue.push_back(timeUs);
            } else {
#if DEBUG_DRIFT_TIME
                if (mFirstSampleTimeUs < 0ll) {
                    mFirstSampleTimeUs = timeUs;
                }

                int64_t driftTimeUs = 0;
                if (mbuf->meta_data()->findInt64(kKeyDriftTime, &driftTimeUs)
                        && driftTimeUs) {
                    driftTimeUs = timeUs - mFirstSampleTimeUs - driftTimeUs;
                }
                mDriftTimeQueue.push_back(driftTimeUs);
#endif // DEBUG_DRIFT_TIME
            }

            sp<ABuffer> inbuf;
            status_t err = mEncoder->getInputBuffer(bufferIndex, &inbuf);
            if (err != OK || inbuf == NULL) {
                mbuf->release();
                signalEOS();
                break;
            }

            size = mbuf->size();

            memcpy(inbuf->data(), mbuf->data(), size);

            if (mIsVideo) {
                // video encoder will release MediaBuffer when done
                // with underlying data.
                inbuf->setMediaBufferBase(mbuf);
            } else {
                mbuf->release();
            }
        } else {
            flags = MediaCodec::BUFFER_FLAG_EOS;
        }

        status_t err = mEncoder->queueInputBuffer(
                bufferIndex, 0, size, timeUs, flags);

        if (err != OK) {
            return err;
        }
    }

    return OK;
}

status_t MediaCodecSource::onStart(MetaData *params) {
    if (mStopping) {
        ALOGE("Failed to start while we're stopping");
        return INVALID_OPERATION;
    }

    if (mStarted) {
        ALOGI("MediaCodecSource (%s) resuming", mIsVideo ? "video" : "audio");
        if (mFlags & FLAG_USE_SURFACE_INPUT) {
            resume();
        } else {
            CHECK(mPuller != NULL);
            mPuller->resume();
        }
        return OK;
    }

    ALOGI("MediaCodecSource (%s) starting", mIsVideo ? "video" : "audio");

    status_t err = OK;

    if (mFlags & FLAG_USE_SURFACE_INPUT) {
        int64_t startTimeUs;
        if (!params || !params->findInt64(kKeyTime, &startTimeUs)) {
            startTimeUs = -1ll;
        }
        resume(startTimeUs);
    } else {
        CHECK(mPuller != NULL);
        sp<AMessage> notify = new AMessage(
                kWhatPullerNotify, mReflector->id());
        err = mPuller->start(params, notify);
        if (err != OK) {
            return err;
        }
    }

    ALOGI("MediaCodecSource (%s) started", mIsVideo ? "video" : "audio");

    mStarted = true;
    return OK;
}

void MediaCodecSource::onMessageReceived(const sp<AMessage> &msg) {
    switch (msg->what()) {
    case kWhatPullerNotify:
    {
        MediaBuffer *mbuf;
        CHECK(msg->findPointer("accessUnit", (void**)&mbuf));

        if (mbuf == NULL) {
            ALOGV("puller (%s) reached EOS",
                    mIsVideo ? "video" : "audio");
            signalEOS();
        }

        if (mEncoder == NULL) {
            ALOGV("got msg '%s' after encoder shutdown.",
                  msg->debugString().c_str());

            if (mbuf != NULL) {
                mbuf->release();
            }

            break;
        }

        mInputBufferQueue.push_back(mbuf);

        feedEncoderInputBuffers();

        break;
    }
    case kWhatEncoderActivity:
    {
        if (mEncoder == NULL) {
            break;
        }

        int32_t cbID;
        CHECK(msg->findInt32("callbackID", &cbID));
        if (cbID == MediaCodec::CB_INPUT_AVAILABLE) {
            int32_t index;
            CHECK(msg->findInt32("index", &index));

            mAvailEncoderInputIndices.push_back(index);
            feedEncoderInputBuffers();
        } else if (cbID == MediaCodec::CB_OUTPUT_AVAILABLE) {
            int32_t index;
            size_t offset;
            size_t size;
            int64_t timeUs;
            int32_t flags;
            native_handle_t* handle = NULL;

            CHECK(msg->findInt32("index", &index));
            CHECK(msg->findSize("offset", &offset));
            CHECK(msg->findSize("size", &size));
            CHECK(msg->findInt64("timeUs", &timeUs));
            CHECK(msg->findInt32("flags", &flags));

            if (flags & MediaCodec::BUFFER_FLAG_EOS) {
                mEncoder->releaseOutputBuffer(index);
                signalEOS();
                break;
            }

            sp<ABuffer> outbuf;
            status_t err = mEncoder->getOutputBuffer(index, &outbuf);
            if (err != OK || outbuf == NULL) {
                signalEOS();
                break;
            }

            MediaBuffer *mbuf = new MediaBuffer(outbuf->size());
            memcpy(mbuf->data(), outbuf->data(), outbuf->size());

            if (!(flags & MediaCodec::BUFFER_FLAG_CODECCONFIG)) {
                if (mIsVideo) {
                    int64_t decodingTimeUs;
                    if (mFlags & FLAG_USE_SURFACE_INPUT) {
                        // GraphicBufferSource is supposed to discard samples
                        // queued before start, and offset timeUs by start time
                        CHECK_GE(timeUs, 0ll);
                        // TODO:
                        // Decoding time for surface source is unavailable,
                        // use presentation time for now. May need to move
                        // this logic into MediaCodec.
                        decodingTimeUs = timeUs;
                    } else {
                        CHECK(!mDecodingTimeQueue.empty());
                        decodingTimeUs = *(mDecodingTimeQueue.begin());
                        mDecodingTimeQueue.erase(mDecodingTimeQueue.begin());
                    }
                    mbuf->meta_data()->setInt64(kKeyDecodingTime, decodingTimeUs);

                    ALOGV("[video] time %" PRId64 " us (%.2f secs), dts/pts diff %" PRId64,
                            timeUs, timeUs / 1E6, decodingTimeUs - timeUs);
                } else {
                    int64_t driftTimeUs = 0;
#if DEBUG_DRIFT_TIME
                    CHECK(!mDriftTimeQueue.empty());
                    driftTimeUs = *(mDriftTimeQueue.begin());
                    mDriftTimeQueue.erase(mDriftTimeQueue.begin());
                    mbuf->meta_data()->setInt64(kKeyDriftTime, driftTimeUs);
#endif // DEBUG_DRIFT_TIME
                    ALOGV("[audio] time %" PRId64 " us (%.2f secs), drift %" PRId64,
                            timeUs, timeUs / 1E6, driftTimeUs);
                }
                mbuf->meta_data()->setInt64(kKeyTime, timeUs);
            } else {
                mbuf->meta_data()->setInt32(kKeyIsCodecConfig, true);
            }
            if (flags & MediaCodec::BUFFER_FLAG_SYNCFRAME) {
                mbuf->meta_data()->setInt32(kKeyIsSyncFrame, true);
            }
            mbuf->setObserver(this);
            mbuf->add_ref();

            {
                Mutex::Autolock autoLock(mOutputBufferLock);
                mOutputBufferQueue.push_back(mbuf);
                mOutputBufferCond.signal();
            }

            mEncoder->releaseOutputBuffer(index);
       } else if (cbID == MediaCodec::CB_ERROR) {
            status_t err;
            CHECK(msg->findInt32("err", &err));
            ALOGE("Encoder (%s) reported error : 0x%x",
                    mIsVideo ? "video" : "audio", err);
            signalEOS();
       }
       break;
    }
    case kWhatStart:
    {
        uint32_t replyID;
        CHECK(msg->senderAwaitsResponse(&replyID));

        sp<RefBase> obj;
        CHECK(msg->findObject("meta", &obj));
        MetaData *params = static_cast<MetaData *>(obj.get());

        sp<AMessage> response = new AMessage;
        response->setInt32("err", onStart(params));
        response->postReply(replyID);
        break;
    }
    case kWhatStop:
    {
        ALOGI("encoder (%s) stopping", mIsVideo ? "video" : "audio");

        uint32_t replyID;
        CHECK(msg->senderAwaitsResponse(&replyID));

        if (mEncoderReachedEOS) {
            // if we already reached EOS, reply and return now
            ALOGI("encoder (%s) already stopped",
                    mIsVideo ? "video" : "audio");
            (new AMessage)->postReply(replyID);
            break;
        }

        mStopReplyIDQueue.push_back(replyID);
        if (mStopping) {
            // nothing to do if we're already stopping, reply will be posted
            // to all when we're stopped.
            break;
        }

        mStopping = true;

        // if using surface, signal source EOS and wait for EOS to come back.
        // otherwise, release encoder and post EOS if haven't done already
        if (mFlags & FLAG_USE_SURFACE_INPUT) {
            mEncoder->signalEndOfInputStream();
        } else {
            signalEOS();
        }
        break;
    }
    case kWhatPause:
    {
        if (mFlags && FLAG_USE_SURFACE_INPUT) {
            suspend();
        } else {
            CHECK(mPuller != NULL);
            mPuller->pause();
        }
        break;
    }
    default:
        TRESPASS();
    }
}

} // namespace android
