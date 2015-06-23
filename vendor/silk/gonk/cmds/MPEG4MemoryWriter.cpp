/*
 * Copyright (C) 2009 The Android Open Source Project
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

//#define LOG_NDEBUG 0
#define LOG_TAG "MPEG4MemoryWriter"

#include <arpa/inet.h>
#include <fcntl.h>
#include <inttypes.h>
#include <pthread.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#include <utils/Log.h>

#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/MediaBuffer.h>
#include <media/stagefright/MetaData.h>
#include <media/stagefright/MediaDefs.h>
#include <media/stagefright/MediaErrors.h>
#include <media/stagefright/MediaSource.h>
#include <media/stagefright/Utils.h>
#include <media/mediarecorder.h>
#include <cutils/properties.h>

#include "MPEG4MemoryWriter.h"

#include "include/ESDS.h"


#ifndef __predict_false
#define __predict_false(exp) __builtin_expect((exp) != 0, 0)
#endif

#define WARN_UNLESS(condition, message, ...) \
( (__predict_false(condition)) ? false : ({ \
    ALOGW("Condition %s failed "  message, #condition, ##__VA_ARGS__); \
    true; \
}))

namespace android {

static const int64_t kMinStreamableFileSizeInBytes = 5 * 1024 * 1024;
static const int64_t kMax32BitFileSize = 0x00ffffffffLL; // 2^32-1 : max FAT32
                                                         // filesystem file size
                                                         // used by most SD cards
static const uint8_t kNalUnitTypeSeqParamSet = 0x07;
static const uint8_t kNalUnitTypePicParamSet = 0x08;
static const int64_t kInitialDelayTimeUs     = 700000LL;

class MPEG4MemoryWriter::Track {
public:
    Track(MPEG4MemoryWriter *owner, const sp<MediaSource> &source, size_t trackId);

    ~Track();

    status_t start(MetaData *params);
    status_t stop();
    status_t pause();
    bool reachedEOS();

    int64_t getDurationUs() const;
    int64_t getEstimatedTrackSizeBytes() const;
    void writeTrackHeader(bool use32BitOffset = true);
    void bufferChunk(int64_t timestampUs);
    bool isAvc() const { return mIsAvc; }
    bool isAudio() const { return mIsAudio; }
    bool isMPEG4() const { return mIsMPEG4; }
    void addChunkOffset(off64_t offset);
    int32_t getTrackId() const { return mTrackId; }
    status_t dump(int fd, const Vector<String16>& args) const;

private:
    enum {
        kMaxCttsOffsetTimeUs = 1000000LL,  // 1 second
        kSampleArraySize = 1000,
    };

    // A helper class to handle faster write box with table entries
    template<class TYPE>
    struct ListTableEntries {
        ListTableEntries(uint32_t elementCapacity, uint32_t entryCapacity)
            : mElementCapacity(elementCapacity),
            mEntryCapacity(entryCapacity),
            mTotalNumTableEntries(0),
            mNumValuesInCurrEntry(0),
            mCurrTableEntriesElement(NULL) {
            CHECK_GT(mElementCapacity, 0);
            CHECK_GT(mEntryCapacity, 0);
        }

        // Free the allocated memory.
        ~ListTableEntries() {
            while (!mTableEntryList.empty()) {
                typename List<TYPE *>::iterator it = mTableEntryList.begin();
                delete[] (*it);
                mTableEntryList.erase(it);
            }
        }

        // Replace the value at the given position by the given value.
        // There must be an existing value at the given position.
        // @arg value must be in network byte order
        // @arg pos location the value must be in.
        void set(const TYPE& value, uint32_t pos) {
            CHECK_LT(pos, mTotalNumTableEntries * mEntryCapacity);

            typename List<TYPE *>::iterator it = mTableEntryList.begin();
            uint32_t iterations = (pos / (mElementCapacity * mEntryCapacity));
            while (it != mTableEntryList.end() && iterations > 0) {
                ++it;
                --iterations;
            }
            CHECK(it != mTableEntryList.end());
            CHECK_EQ(iterations, 0);

            (*it)[(pos % (mElementCapacity * mEntryCapacity))] = value;
        }

        // Get the value at the given position by the given value.
        // @arg value the retrieved value at the position in network byte order.
        // @arg pos location the value must be in.
        // @return true if a value is found.
        bool get(TYPE& value, uint32_t pos) const {
            if (pos >= mTotalNumTableEntries * mEntryCapacity) {
                return false;
            }

            typename List<TYPE *>::iterator it = mTableEntryList.begin();
            uint32_t iterations = (pos / (mElementCapacity * mEntryCapacity));
            while (it != mTableEntryList.end() && iterations > 0) {
                ++it;
                --iterations;
            }
            CHECK(it != mTableEntryList.end());
            CHECK_EQ(iterations, 0);

            value = (*it)[(pos % (mElementCapacity * mEntryCapacity))];
            return true;
        }

        // Store a single value.
        // @arg value must be in network byte order.
        void add(const TYPE& value) {
            CHECK_LT(mNumValuesInCurrEntry, mElementCapacity);
            uint32_t nEntries = mTotalNumTableEntries % mElementCapacity;
            uint32_t nValues  = mNumValuesInCurrEntry % mEntryCapacity;
            if (nEntries == 0 && nValues == 0) {
                mCurrTableEntriesElement = new TYPE[mEntryCapacity * mElementCapacity];
                CHECK(mCurrTableEntriesElement != NULL);
                mTableEntryList.push_back(mCurrTableEntriesElement);
            }

            uint32_t pos = nEntries * mEntryCapacity + nValues;
            mCurrTableEntriesElement[pos] = value;

            ++mNumValuesInCurrEntry;
            if ((mNumValuesInCurrEntry % mEntryCapacity) == 0) {
                ++mTotalNumTableEntries;
                mNumValuesInCurrEntry = 0;
            }
        }

        // Write out the table entries:
        // 1. the number of entries goes first
        // 2. followed by the values in the table enties in order
        // @arg writer the writer to actual write to the storage
        void write(MPEG4MemoryWriter *writer) const {
            CHECK_EQ(mNumValuesInCurrEntry % mEntryCapacity, 0);
            uint32_t nEntries = mTotalNumTableEntries;
            writer->writeInt32(nEntries);
            for (typename List<TYPE *>::iterator it = mTableEntryList.begin();
                it != mTableEntryList.end(); ++it) {
                CHECK_GT(nEntries, 0);
                if (nEntries >= mElementCapacity) {
                    writer->write(*it, sizeof(TYPE) * mEntryCapacity, mElementCapacity);
                    nEntries -= mElementCapacity;
                } else {
                    writer->write(*it, sizeof(TYPE) * mEntryCapacity, nEntries);
                    break;
                }
            }
        }

        // Return the number of entries in the table.
        uint32_t count() const { return mTotalNumTableEntries; }

    private:
        uint32_t         mElementCapacity;  // # entries in an element
        uint32_t         mEntryCapacity;    // # of values in each entry
        uint32_t         mTotalNumTableEntries;
        uint32_t         mNumValuesInCurrEntry;  // up to mEntryCapacity
        TYPE             *mCurrTableEntriesElement;
        mutable List<TYPE *>     mTableEntryList;

        DISALLOW_EVIL_CONSTRUCTORS(ListTableEntries);
    };



    MPEG4MemoryWriter *mOwner;
    sp<MetaData> mMeta;
    sp<MediaSource> mSource;
    volatile bool mDone;
    volatile bool mPaused;
    volatile bool mResumed;
    volatile bool mStarted;
    bool mIsAvc;
    bool mIsAudio;
    bool mIsMPEG4;
    int32_t mTrackId;
    int64_t mTrackDurationUs;
    int64_t mMaxChunkDurationUs;

    int64_t mEstimatedTrackSizeBytes;
    int64_t mMdatSizeBytes;
    int32_t mTimeScale;

    pthread_t mThread;


    List<MediaBuffer *> mChunkSamples;

    bool                mSamplesHaveSameSize;
    ListTableEntries<uint32_t> *mStszTableEntries;

    ListTableEntries<uint32_t> *mStcoTableEntries;
    ListTableEntries<off64_t> *mCo64TableEntries;
    ListTableEntries<uint32_t> *mStscTableEntries;
    ListTableEntries<uint32_t> *mStssTableEntries;
    ListTableEntries<uint32_t> *mSttsTableEntries;
    ListTableEntries<uint32_t> *mCttsTableEntries;

    int64_t mMinCttsOffsetTimeUs;
    int64_t mMaxCttsOffsetTimeUs;

    // Sequence parameter set or picture parameter set
    struct AVCParamSet {
        AVCParamSet(uint16_t length, const uint8_t *data)
            : mLength(length), mData(data) {}

        uint16_t mLength;
        const uint8_t *mData;
    };
    List<AVCParamSet> mSeqParamSets;
    List<AVCParamSet> mPicParamSets;
    uint8_t mProfileIdc;
    uint8_t mProfileCompatible;
    uint8_t mLevelIdc;

    void *mCodecSpecificData;
    size_t mCodecSpecificDataSize;
    bool mGotAllCodecSpecificData;
    bool mTrackingProgressStatus;

    bool mReachedEOS;
    int64_t mStartTimestampUs;
    int64_t mStartTimeRealUs;
    int64_t mFirstSampleTimeRealUs;
    int64_t mPreviousTrackTimeUs;
    int64_t mTrackEveryTimeDurationUs;

    // Update the audio track's drift information.
    void updateDriftTime(const sp<MetaData>& meta);

    int32_t getStartTimeOffsetScaledTime() const;

    static void *ThreadWrapper(void *me);
    status_t threadEntry();

    const uint8_t *parseParamSet(
        const uint8_t *data, size_t length, int type, size_t *paramSetLen);

    status_t makeAVCCodecSpecificData(const uint8_t *data, size_t size);
    status_t copyAVCCodecSpecificData(const uint8_t *data, size_t size);
    status_t parseAVCCodecSpecificData(const uint8_t *data, size_t size);

    // Track authoring progress status
    void trackProgressStatus(int64_t timeUs, status_t err = OK);
    void initTrackingProgressStatus(MetaData *params);

    void getCodecSpecificDataFromInputFormatIfPossible();

    // Determine the track time scale
    // If it is an audio track, try to use the sampling rate as
    // the time scale; however, if user chooses the overwrite
    // value, the user-supplied time scale will be used.
    void setTimeScale();

    // Simple validation on the codec specific data
    status_t checkCodecSpecificData() const;
    int32_t mRotation;

    void addOneStscTableEntry(size_t chunkId, size_t sampleId);
    void addOneStssTableEntry(size_t sampleId);

    // Duration is time scale based
    void addOneSttsTableEntry(size_t sampleCount, int32_t timescaledDur);
    void addOneCttsTableEntry(size_t sampleCount, int32_t timescaledDur);

    bool isTrackMalFormed() const;
    void sendTrackSummary(bool hasMultipleTracks);

    // Write the boxes
    void writeStcoBox(bool use32BitOffset);
    void writeStscBox();
    void writeStszBox();
    void writeStssBox();
    void writeSttsBox();
    void writeCttsBox();
    void writeD263Box();
    void writePaspBox();
    void writeAvccBox();
    void writeUrlBox();
    void writeDrefBox();
    void writeDinfBox();
    void writeDamrBox();
    void writeMdhdBox(uint32_t now);
    void writeSmhdBox();
    void writeVmhdBox();
    void writeHdlrBox();
    void writeTkhdBox(uint32_t now);
    void writeMp4aEsdsBox();
    void writeMp4vEsdsBox();
    void writeAudioFourCCBox();
    void writeVideoFourCCBox();
    void writeStblBox(bool use32BitOffset);

    Track(const Track &);
    Track &operator=(const Track &);
};

MPEG4MemoryWriter::MPEG4MemoryWriter()
    : mBufferPos(0),
      mInitCheck(NO_INIT),
      mIsRealTimeRecording(true),
      mUse4ByteNalLength(true),
      mUse32BitOffset(true),
      mPaused(false),
      mStarted(false),
      mWriterThreadStarted(false),
      mOffset(0),
      mMdatOffset(0),
      mInterleaveDurationUs(1000000),
      mLatitudex10000(0),
      mLongitudex10000(0),
      mAreGeoTagsAvailable(false),
      mStartTimeOffsetMs(-1) {
    mInitCheck = OK;
}

MPEG4MemoryWriter::~MPEG4MemoryWriter() {
    reset();

    while (!mTracks.empty()) {
        List<Track *>::iterator it = mTracks.begin();
        delete *it;
        (*it) = NULL;
        mTracks.erase(it);
    }
    mTracks.clear();
}

status_t MPEG4MemoryWriter::dump(
        int fd, const Vector<String16>& args) {
    const size_t SIZE = 256;
    char buffer[SIZE];
    String8 result;
    snprintf(buffer, SIZE, "   MPEG4MemoryWriter %p\n", this);
    result.append(buffer);
    snprintf(buffer, SIZE, "     mStarted: %s\n", mStarted? "true": "false");
    result.append(buffer);
    ::write(fd, result.string(), result.size());
    for (List<Track *>::iterator it = mTracks.begin();
         it != mTracks.end(); ++it) {
        (*it)->dump(fd, args);
    }
    return OK;
}

status_t MPEG4MemoryWriter::Track::dump(
        int fd, const Vector<String16>& /* args */) const {
    const size_t SIZE = 256;
    char buffer[SIZE];
    String8 result;
    snprintf(buffer, SIZE, "     %s track\n", mIsAudio? "Audio": "Video");
    result.append(buffer);
    snprintf(buffer, SIZE, "       reached EOS: %s\n",
            mReachedEOS? "true": "false");
    result.append(buffer);
    snprintf(buffer, SIZE, "       frames encoded : %d\n", mStszTableEntries->count());
    result.append(buffer);
    snprintf(buffer, SIZE, "       duration encoded : %" PRId64 " us\n", mTrackDurationUs);
    result.append(buffer);
    ::write(fd, result.string(), result.size());
    return OK;
}

status_t MPEG4MemoryWriter::addSource(const sp<MediaSource> &source) {
    Mutex::Autolock l(mLock);
    if (mStarted) {
        ALOGE("Attempt to add source AFTER recording is started");
        return UNKNOWN_ERROR;
    }

    // At most 2 tracks can be supported.
    if (mTracks.size() >= 2) {
        ALOGE("Too many tracks (%zu) to add", mTracks.size());
        return ERROR_UNSUPPORTED;
    }

    CHECK(source.get() != NULL);

    // A track of type other than video or audio is not supported.
    const char *mime;
    source->getFormat()->findCString(kKeyMIMEType, &mime);
    bool isAudio = !strncasecmp(mime, "audio/", 6);
    bool isVideo = !strncasecmp(mime, "video/", 6);
    if (!isAudio && !isVideo) {
        ALOGE("Track (%s) other than video or audio is not supported",
            mime);
        return ERROR_UNSUPPORTED;
    }

    // At this point, we know the track to be added is either
    // video or audio. Thus, we only need to check whether it
    // is an audio track or not (if it is not, then it must be
    // a video track).

    // No more than one video or one audio track is supported.
    for (List<Track*>::iterator it = mTracks.begin();
         it != mTracks.end(); ++it) {
        if ((*it)->isAudio() == isAudio) {
            ALOGE("%s track already exists", isAudio? "Audio": "Video");
            return ERROR_UNSUPPORTED;
        }
    }

    // This is the first track of either audio or video.
    // Go ahead to add the track.
    Track *track = new Track(this, source, 1 + mTracks.size());
    mTracks.push_back(track);

    return OK;
}

status_t MPEG4MemoryWriter::startTracks(MetaData *params) {
    if (mTracks.empty()) {
        ALOGE("No source added");
        return INVALID_OPERATION;
    }

    for (List<Track *>::iterator it = mTracks.begin();
         it != mTracks.end(); ++it) {
        status_t err = (*it)->start(params);

        if (err != OK) {
            for (List<Track *>::iterator it2 = mTracks.begin();
                 it2 != it; ++it2) {
                (*it2)->stop();
            }

            return err;
        }
    }
    return OK;
}

status_t MPEG4MemoryWriter::start(MetaData *param) {
    if (mInitCheck != OK) {
        return UNKNOWN_ERROR;
    }

    int32_t use64BitOffset;
    if (param &&
        param->findInt32(kKey64BitFileOffset, &use64BitOffset) &&
        use64BitOffset) {
        mUse32BitOffset = false;
    }

    int32_t use2ByteNalLength;
    if (param &&
        param->findInt32(kKey2ByteNalLength, &use2ByteNalLength) &&
        use2ByteNalLength) {
        mUse4ByteNalLength = false;
    }

    int32_t isRealTimeRecording;
    if (param && param->findInt32(kKeyRealTimeRecording, &isRealTimeRecording)) {
        mIsRealTimeRecording = isRealTimeRecording;
    }

    mStartTimestampUs = -1;

    if (mStarted) {
        if (mPaused) {
            mPaused = false;
            return startTracks(param);
        }
        return OK;
    }

    if (!param ||
        !param->findInt32(kKeyTimeScale, &mTimeScale)) {
        mTimeScale = 1000;
    }
    CHECK_GT(mTimeScale, 0);
    ALOGV("movie time scale: %d", mTimeScale);

    writeFtypBox();
    writeFreeBox();

    mMdatOffset = mOffset;

    if (mUse32BitOffset) {
        write("????mdat", 8);
    } else {
        write("\x00\x00\x00\x01mdat????????", 16);
    }

    status_t err = startWriterThread();
    if (err != OK) {
        return err;
    }

    err = startTracks(param);
    if (err != OK) {
        return err;
    }

    mStarted = true;
    return OK;
}

bool MPEG4MemoryWriter::use32BitFileOffset() const {
    return mUse32BitOffset;
}

status_t MPEG4MemoryWriter::pause() {
    if (mInitCheck != OK) {
        return OK;
    }
    mPaused = true;
    status_t err = OK;
    for (List<Track *>::iterator it = mTracks.begin();
         it != mTracks.end(); ++it) {
        status_t status = (*it)->pause();
        if (status != OK) {
            err = status;
        }
    }
    return err;
}

void MPEG4MemoryWriter::stopWriterThread() {
    ALOGD("Stopping writer thread");
    if (!mWriterThreadStarted) {
        return;
    }

    {
        Mutex::Autolock autolock(mLock);

        mDone = true;
        mChunkReadyCondition.signal();
    }

    void *dummy;
    pthread_join(mThread, &dummy);
    mWriterThreadStarted = false;
    ALOGD("Writer thread stopped");
}

/*
 * MP4 file standard defines a composition matrix:
 * | a  b  u |
 * | c  d  v |
 * | x  y  w |
 *
 * the element in the matrix is stored in the following
 * order: {a, b, u, c, d, v, x, y, w},
 * where a, b, c, d, x, and y is in 16.16 format, while
 * u, v and w is in 2.30 format.
 */
void MPEG4MemoryWriter::writeCompositionMatrix(int degrees) {
    ALOGV("writeCompositionMatrix");
    uint32_t a = 0x00010000;
    uint32_t b = 0;
    uint32_t c = 0;
    uint32_t d = 0x00010000;
    switch (degrees) {
        case 0:
            break;
        case 90:
            a = 0;
            b = 0x00010000;
            c = 0xFFFF0000;
            d = 0;
            break;
        case 180:
            a = 0xFFFF0000;
            d = 0xFFFF0000;
            break;
        case 270:
            a = 0;
            b = 0xFFFF0000;
            c = 0x00010000;
            d = 0;
            break;
        default:
            CHECK(!"Should never reach this unknown rotation");
            break;
    }

    writeInt32(a);           // a
    writeInt32(b);           // b
    writeInt32(0);           // u
    writeInt32(c);           // c
    writeInt32(d);           // d
    writeInt32(0);           // v
    writeInt32(0);           // x
    writeInt32(0);           // y
    writeInt32(0x40000000);  // w
}

void MPEG4MemoryWriter::release() {
    mInitCheck = NO_INIT;
    mStarted = false;
}

status_t MPEG4MemoryWriter::reset() {
    if (mInitCheck != OK) {
        return OK;
    } else {
        if (!mWriterThreadStarted ||
            !mStarted) {
            if (mWriterThreadStarted) {
                stopWriterThread();
            }
            release();
            return OK;
        }
    }

    status_t err = OK;
    int64_t maxDurationUs = 0;
    int64_t minDurationUs = 0x7fffffffffffffffLL;
    for (List<Track *>::iterator it = mTracks.begin();
         it != mTracks.end(); ++it) {
        status_t status = (*it)->stop();
        if (err == OK && status != OK) {
            err = status;
        }

        int64_t durationUs = (*it)->getDurationUs();
        if (durationUs > maxDurationUs) {
            maxDurationUs = durationUs;
        }
        if (durationUs < minDurationUs) {
            minDurationUs = durationUs;
        }
    }

    if (mTracks.size() > 1) {
        ALOGD("Duration from tracks range is [%" PRId64 ", %" PRId64 "] us",
            minDurationUs, maxDurationUs);
    }

    stopWriterThread();

    // Do not write out movie header on error.
    if (err != OK) {
        release();
        return err;
    }

    // Fix up the size of the 'mdat' chunk.
    if (mUse32BitOffset) {
        mBufferPos = mMdatOffset;
        uint32_t size = htonl(static_cast<uint32_t>(mOffset - mMdatOffset));
        write_mem(&size, 4);
    } else {
        mBufferPos = mMdatOffset + 8;
        uint64_t size = mOffset - mMdatOffset;
        size = hton64(size);
        write_mem(&size, 8);
    }
    mBufferPos = mOffset;

    writeMoovBox(maxDurationUs);

    CHECK(mBoxes.empty());

    release();
    return err;
}

void MPEG4MemoryWriter::writeMvhdBox(int64_t durationUs) {
    beginBox("mvhd");
    writeInt32(0);             // version=0, flags=0
    writeInt32(0);             // creation time
    writeInt32(0);             // modification time
    writeInt32(mTimeScale);    // mvhd timescale
    int32_t duration = (durationUs * mTimeScale + 5E5) / 1E6;
    writeInt32(duration);
    writeInt32(0x10000);       // rate: 1.0
    writeInt16(0x100);         // volume
    writeInt16(0);             // reserved
    writeInt32(0);             // reserved
    writeInt32(0);             // reserved
    writeCompositionMatrix(0); // matrix
    writeInt32(0);             // predefined
    writeInt32(0);             // predefined
    writeInt32(0);             // predefined
    writeInt32(0);             // predefined
    writeInt32(0);             // predefined
    writeInt32(0);             // predefined
    writeInt32(mTracks.size() + 1);  // nextTrackID
    endBox();  // mvhd
}

void MPEG4MemoryWriter::writeMoovBox(int64_t durationUs) {
    beginBox("moov");
    writeMvhdBox(durationUs);
    if (mAreGeoTagsAvailable) {
        writeUdtaBox();
    }
    int32_t id = 1;
    for (List<Track *>::iterator it = mTracks.begin();
        it != mTracks.end(); ++it, ++id) {
        (*it)->writeTrackHeader(mUse32BitOffset);
    }
    endBox();  // moov
}

void MPEG4MemoryWriter::writeFtypBox() {
    beginBox("ftyp");
    writeFourcc("isom");
    writeInt32(512);
    writeFourcc("isom");
    writeFourcc("iso2");
    writeFourcc("avc1");
    writeFourcc("mp41");
    endBox();
}

void MPEG4MemoryWriter::writeFreeBox() {
    beginBox("free");
    endBox();
}

static bool isTestModeEnabled() {
#if (PROPERTY_VALUE_MAX < 5)
#error "PROPERTY_VALUE_MAX must be at least 5"
#endif

    // Test mode is enabled only if rw.media.record.test system
    // property is enabled.
    char value[PROPERTY_VALUE_MAX];
    if (property_get("rw.media.record.test", value, NULL) &&
        (!strcasecmp(value, "true") || !strcasecmp(value, "1"))) {
        return true;
    }
    return false;
}

void MPEG4MemoryWriter::sendSessionSummary() {
    // Send session summary only if test mode is enabled
    if (!isTestModeEnabled()) {
        return;
    }

    for (List<ChunkInfo>::iterator it = mChunkInfos.begin();
         it != mChunkInfos.end(); ++it) {
        int trackNum = it->mTrack->getTrackId() << 28;
        notify(MEDIA_RECORDER_TRACK_EVENT_INFO,
                trackNum | MEDIA_RECORDER_TRACK_INTER_CHUNK_TIME_MS,
                it->mMaxInterChunkDurUs);
    }
}

status_t MPEG4MemoryWriter::setInterleaveDuration(uint32_t durationUs) {
    mInterleaveDurationUs = durationUs;
    return OK;
}

void MPEG4MemoryWriter::lock() {
    mLock.lock();
}

void MPEG4MemoryWriter::unlock() {
    mLock.unlock();
}

off64_t MPEG4MemoryWriter::addSample_l(MediaBuffer *buffer) {
    off64_t old_offset = mOffset;

    write_mem(
          (const uint8_t *)buffer->data() + buffer->range_offset(),
          buffer->range_length());

    mOffset += buffer->range_length();

    return old_offset;
}

static void StripStartcode(MediaBuffer *buffer) {
    if (buffer->range_length() < 4) {
        return;
    }

    const uint8_t *ptr =
        (const uint8_t *)buffer->data() + buffer->range_offset();

    if (!memcmp(ptr, "\x00\x00\x00\x01", 4)) {
        buffer->set_range(
                buffer->range_offset() + 4, buffer->range_length() - 4);
    }
}

off64_t MPEG4MemoryWriter::addLengthPrefixedSample_l(MediaBuffer *buffer) {
    off64_t old_offset = mOffset;

    size_t length = buffer->range_length();

    if (mUse4ByteNalLength) {
        uint8_t x = length >> 24;
        write_mem(&x, 1);
        x = (length >> 16) & 0xff;
        write_mem(&x, 1);
        x = (length >> 8) & 0xff;
        write_mem(&x, 1);
        x = length & 0xff;
        write_mem(&x, 1);

        write_mem(
              (const uint8_t *)buffer->data() + buffer->range_offset(),
              length);

        mOffset += length + 4;
    } else {
        CHECK_LT(length, 65536);

        uint8_t x = length >> 8;
        write_mem(&x, 1);
        x = length & 0xff;
        write_mem(&x, 1);
        write_mem((const uint8_t *)buffer->data() + buffer->range_offset(), length);
        mOffset += length + 2;
    }

    return old_offset;
}

size_t MPEG4MemoryWriter::write(
        const void *ptr, size_t size, size_t nmemb) {
    const size_t bytes = size * nmemb;
    write_mem(ptr, size * nmemb);
    mOffset += bytes;
    return bytes;
}

void MPEG4MemoryWriter::beginBox(const char *fourcc) {
    CHECK_EQ(strlen(fourcc), 4);

    mBoxes.push_back(mOffset);

    writeInt32(0);
    writeFourcc(fourcc);
}

void MPEG4MemoryWriter::endBox() {
    CHECK(!mBoxes.empty());

    off64_t offset = *--mBoxes.end();
    mBoxes.erase(--mBoxes.end());

    mBufferPos = offset;
    writeInt32(mOffset - offset);
    mOffset -= 4;
    mBufferPos = mOffset;
}

void MPEG4MemoryWriter::writeInt8(int8_t x) {
    write(&x, 1, 1);
}

void MPEG4MemoryWriter::writeInt16(int16_t x) {
    x = htons(x);
    write(&x, 1, 2);
}

void MPEG4MemoryWriter::writeInt32(int32_t x) {
    x = htonl(x);
    write(&x, 1, 4);
}

void MPEG4MemoryWriter::writeInt64(int64_t x) {
    x = hton64(x);
    write(&x, 1, 8);
}

void MPEG4MemoryWriter::writeCString(const char *s) {
    size_t n = strlen(s);
    write(s, 1, n + 1);
}

void MPEG4MemoryWriter::writeFourcc(const char *s) {
    CHECK_EQ(strlen(s), 4);
    write(s, 1, 4);
}


// Written in +/-DD.DDDD format
void MPEG4MemoryWriter::writeLatitude(int degreex10000) {
    bool isNegative = (degreex10000 < 0);
    char sign = isNegative? '-': '+';

    // Handle the whole part
    char str[9];
    int wholePart = degreex10000 / 10000;
    if (wholePart == 0) {
        snprintf(str, 5, "%c%.2d.", sign, wholePart);
    } else {
        snprintf(str, 5, "%+.2d.", wholePart);
    }

    // Handle the fractional part
    int fractionalPart = degreex10000 - (wholePart * 10000);
    if (fractionalPart < 0) {
        fractionalPart = -fractionalPart;
    }
    snprintf(&str[4], 5, "%.4d", fractionalPart);

    // Do not write the null terminator
    write(str, 1, 8);
}

// Written in +/- DDD.DDDD format
void MPEG4MemoryWriter::writeLongitude(int degreex10000) {
    bool isNegative = (degreex10000 < 0);
    char sign = isNegative? '-': '+';

    // Handle the whole part
    char str[10];
    int wholePart = degreex10000 / 10000;
    if (wholePart == 0) {
        snprintf(str, 6, "%c%.3d.", sign, wholePart);
    } else {
        snprintf(str, 6, "%+.3d.", wholePart);
    }

    // Handle the fractional part
    int fractionalPart = degreex10000 - (wholePart * 10000);
    if (fractionalPart < 0) {
        fractionalPart = -fractionalPart;
    }
    snprintf(&str[5], 5, "%.4d", fractionalPart);

    // Do not write the null terminator
    write(str, 1, 9);
}

/*
 * Geodata is stored according to ISO-6709 standard.
 * latitudex10000 is latitude in degrees times 10000, and
 * longitudex10000 is longitude in degrees times 10000.
 * The range for the latitude is in [-90, +90], and
 * The range for the longitude is in [-180, +180]
 */
status_t MPEG4MemoryWriter::setGeoData(int latitudex10000, int longitudex10000) {
    // Is latitude or longitude out of range?
    if (latitudex10000 < -900000 || latitudex10000 > 900000 ||
        longitudex10000 < -1800000 || longitudex10000 > 1800000) {
        return BAD_VALUE;
    }

    mLatitudex10000 = latitudex10000;
    mLongitudex10000 = longitudex10000;
    mAreGeoTagsAvailable = true;
    return OK;
}

void MPEG4MemoryWriter::write(const void *data, size_t size) {
    write(data, 1, size);
}

bool MPEG4MemoryWriter::reachedEOS() {
    bool allDone = true;
    for (List<Track *>::iterator it = mTracks.begin();
         it != mTracks.end(); ++it) {
        if (!(*it)->reachedEOS()) {
            allDone = false;
            break;
        }
    }

    return allDone;
}

void MPEG4MemoryWriter::setStartTimestampUs(int64_t timeUs) {
    ALOGI("setStartTimestampUs: %" PRId64, timeUs);
    CHECK_GE(timeUs, 0ll);
    Mutex::Autolock autoLock(mLock);
    if (mStartTimestampUs < 0 || mStartTimestampUs > timeUs) {
        mStartTimestampUs = timeUs;
        ALOGI("Earliest track starting time: %" PRId64, mStartTimestampUs);
    }
}

int64_t MPEG4MemoryWriter::getStartTimestampUs() {
    Mutex::Autolock autoLock(mLock);
    return mStartTimestampUs;
}

size_t MPEG4MemoryWriter::numTracks() {
    Mutex::Autolock autolock(mLock);
    return mTracks.size();
}

////////////////////////////////////////////////////////////////////////////////

MPEG4MemoryWriter::Track::Track(
        MPEG4MemoryWriter *owner, const sp<MediaSource> &source, size_t trackId)
    : mOwner(owner),
      mMeta(source->getFormat()),
      mSource(source),
      mDone(false),
      mPaused(false),
      mResumed(false),
      mStarted(false),
      mTrackId(trackId),
      mTrackDurationUs(0),
      mEstimatedTrackSizeBytes(0),
      mSamplesHaveSameSize(true),
      mStszTableEntries(new ListTableEntries<uint32_t>(1000, 1)),
      mStcoTableEntries(new ListTableEntries<uint32_t>(1000, 1)),
      mCo64TableEntries(new ListTableEntries<off64_t>(1000, 1)),
      mStscTableEntries(new ListTableEntries<uint32_t>(1000, 3)),
      mStssTableEntries(new ListTableEntries<uint32_t>(1000, 1)),
      mSttsTableEntries(new ListTableEntries<uint32_t>(1000, 2)),
      mCttsTableEntries(new ListTableEntries<uint32_t>(1000, 2)),
      mCodecSpecificData(NULL),
      mCodecSpecificDataSize(0),
      mGotAllCodecSpecificData(false),
      mReachedEOS(false),
      mRotation(0) {
    getCodecSpecificDataFromInputFormatIfPossible();

    const char *mime;
    mMeta->findCString(kKeyMIMEType, &mime);
    mIsAvc = !strcasecmp(mime, MEDIA_MIMETYPE_VIDEO_AVC);
    mIsAudio = !strncasecmp(mime, "audio/", 6);
    mIsMPEG4 = !strcasecmp(mime, MEDIA_MIMETYPE_VIDEO_MPEG4) ||
               !strcasecmp(mime, MEDIA_MIMETYPE_AUDIO_AAC);

    setTimeScale();
}

void MPEG4MemoryWriter::Track::addOneStscTableEntry(
        size_t chunkId, size_t sampleId) {

        mStscTableEntries->add(htonl(chunkId));
        mStscTableEntries->add(htonl(sampleId));
        mStscTableEntries->add(htonl(1));
}

void MPEG4MemoryWriter::Track::addOneStssTableEntry(size_t sampleId) {
    mStssTableEntries->add(htonl(sampleId));
}

void MPEG4MemoryWriter::Track::addOneSttsTableEntry(
        size_t sampleCount, int32_t duration) {

    if (duration == 0) {
        ALOGW("0-duration samples found: %zu", sampleCount);
    }
    mSttsTableEntries->add(htonl(sampleCount));
    mSttsTableEntries->add(htonl(duration));
}

void MPEG4MemoryWriter::Track::addOneCttsTableEntry(
        size_t sampleCount, int32_t duration) {

    if (mIsAudio) {
        return;
    }
    mCttsTableEntries->add(htonl(sampleCount));
    mCttsTableEntries->add(htonl(duration));
}

void MPEG4MemoryWriter::Track::addChunkOffset(off64_t offset) {
    if (mOwner->use32BitFileOffset()) {
        uint32_t value = offset;
        mStcoTableEntries->add(htonl(value));
    } else {
        mCo64TableEntries->add(hton64(offset));
    }
}

void MPEG4MemoryWriter::Track::setTimeScale() {
    ALOGV("setTimeScale");
    // Default time scale
    mTimeScale = 90000;

    if (mIsAudio) {
        // Use the sampling rate as the default time scale for audio track.
        int32_t sampleRate;
        bool success = mMeta->findInt32(kKeySampleRate, &sampleRate);
        CHECK(success);
        mTimeScale = sampleRate;
    }

    // If someone would like to overwrite the timescale, use user-supplied value.
    int32_t timeScale;
    if (mMeta->findInt32(kKeyTimeScale, &timeScale)) {
        mTimeScale = timeScale;
    }

    CHECK_GT(mTimeScale, 0);
}

void MPEG4MemoryWriter::Track::getCodecSpecificDataFromInputFormatIfPossible() {
    const char *mime;
    CHECK(mMeta->findCString(kKeyMIMEType, &mime));

    if (!strcasecmp(mime, MEDIA_MIMETYPE_VIDEO_AVC)) {
        uint32_t type;
        const void *data;
        size_t size;
        if (mMeta->findData(kKeyAVCC, &type, &data, &size)) {
            mCodecSpecificData = malloc(size);
            mCodecSpecificDataSize = size;
            memcpy(mCodecSpecificData, data, size);
            mGotAllCodecSpecificData = true;
        }
    } else if (!strcasecmp(mime, MEDIA_MIMETYPE_VIDEO_MPEG4)
            || !strcasecmp(mime, MEDIA_MIMETYPE_AUDIO_AAC)) {
        uint32_t type;
        const void *data;
        size_t size;
        if (mMeta->findData(kKeyESDS, &type, &data, &size)) {
            ESDS esds(data, size);
            if (esds.getCodecSpecificInfo(&data, &size) == OK) {
                mCodecSpecificData = malloc(size);
                mCodecSpecificDataSize = size;
                memcpy(mCodecSpecificData, data, size);
                mGotAllCodecSpecificData = true;
            }
        }
    }
}

MPEG4MemoryWriter::Track::~Track() {
    stop();

    delete mStszTableEntries;
    delete mStcoTableEntries;
    delete mCo64TableEntries;
    delete mStscTableEntries;
    delete mSttsTableEntries;
    delete mStssTableEntries;
    delete mCttsTableEntries;

    mStszTableEntries = NULL;
    mStcoTableEntries = NULL;
    mCo64TableEntries = NULL;
    mStscTableEntries = NULL;
    mSttsTableEntries = NULL;
    mStssTableEntries = NULL;
    mCttsTableEntries = NULL;

    if (mCodecSpecificData != NULL) {
        free(mCodecSpecificData);
        mCodecSpecificData = NULL;
    }
}

void MPEG4MemoryWriter::Track::initTrackingProgressStatus(MetaData *params) {
    ALOGV("initTrackingProgressStatus");
    mPreviousTrackTimeUs = -1;
    mTrackingProgressStatus = false;
    mTrackEveryTimeDurationUs = 0;
    {
        int64_t timeUs;
        if (params && params->findInt64(kKeyTrackTimeStatus, &timeUs)) {
            ALOGV("Receive request to track progress status for every %" PRId64 " us", timeUs);
            mTrackEveryTimeDurationUs = timeUs;
            mTrackingProgressStatus = true;
        }
    }
}

// static
void *MPEG4MemoryWriter::ThreadWrapper(void *me) {
    ALOGV("ThreadWrapper: %p", me);
    MPEG4MemoryWriter *writer = static_cast<MPEG4MemoryWriter *>(me);
    writer->threadFunc();
    return NULL;
}

void MPEG4MemoryWriter::bufferChunk(const Chunk& chunk) {
    ALOGV("bufferChunk: %p", chunk.mTrack);
    Mutex::Autolock autolock(mLock);
    CHECK_EQ(mDone, false);

    for (List<ChunkInfo>::iterator it = mChunkInfos.begin();
         it != mChunkInfos.end(); ++it) {

        if (chunk.mTrack == it->mTrack) {  // Found owner
            it->mChunks.push_back(chunk);
            mChunkReadyCondition.signal();
            return;
        }
    }

    CHECK(!"Received a chunk for a unknown track");
}

void MPEG4MemoryWriter::writeChunkToFile(Chunk* chunk) {
    ALOGV("writeChunkToFile: %" PRId64 " from %s track",
        chunk->mTimeStampUs, chunk->mTrack->isAudio()? "audio": "video");

    int32_t isFirstSample = true;
    while (!chunk->mSamples.empty()) {
        List<MediaBuffer *>::iterator it = chunk->mSamples.begin();

        off64_t offset = chunk->mTrack->isAvc()
                                ? addLengthPrefixedSample_l(*it)
                                : addSample_l(*it);

        if (isFirstSample) {
            chunk->mTrack->addChunkOffset(offset);
            isFirstSample = false;
        }

        (*it)->release();
        (*it) = NULL;
        chunk->mSamples.erase(it);
    }
    chunk->mSamples.clear();
}

void MPEG4MemoryWriter::writeAllChunks() {
    ALOGV("writeAllChunks");
    size_t outstandingChunks = 0;
    Chunk chunk;
    while (findChunkToWrite(&chunk)) {
        writeChunkToFile(&chunk);
        ++outstandingChunks;
    }

    sendSessionSummary();

    mChunkInfos.clear();
    ALOGD("%zu chunks are written in the last batch", outstandingChunks);
}

bool MPEG4MemoryWriter::findChunkToWrite(Chunk *chunk) {
    ALOGV("findChunkToWrite");

    int64_t minTimestampUs = 0x7FFFFFFFFFFFFFFFLL;
    Track *track = NULL;
    for (List<ChunkInfo>::iterator it = mChunkInfos.begin();
         it != mChunkInfos.end(); ++it) {
        if (!it->mChunks.empty()) {
            List<Chunk>::iterator chunkIt = it->mChunks.begin();
            if (chunkIt->mTimeStampUs < minTimestampUs) {
                minTimestampUs = chunkIt->mTimeStampUs;
                track = it->mTrack;
            }
        }
    }

    if (track == NULL) {
        ALOGV("Nothing to be written after all");
        return false;
    }

    if (mIsFirstChunk) {
        mIsFirstChunk = false;
    }

    for (List<ChunkInfo>::iterator it = mChunkInfos.begin();
         it != mChunkInfos.end(); ++it) {
        if (it->mTrack == track) {
            *chunk = *(it->mChunks.begin());
            it->mChunks.erase(it->mChunks.begin());
            CHECK_EQ(chunk->mTrack, track);

            int64_t interChunkTimeUs =
                chunk->mTimeStampUs - it->mPrevChunkTimestampUs;
            if (interChunkTimeUs > it->mPrevChunkTimestampUs) {
                it->mMaxInterChunkDurUs = interChunkTimeUs;
            }

            return true;
        }
    }

    return false;
}

void MPEG4MemoryWriter::threadFunc() {
    ALOGV("threadFunc");

    prctl(PR_SET_NAME, (unsigned long)"MPEG4MemoryWriter", 0, 0, 0);

    Mutex::Autolock autoLock(mLock);
    while (!mDone) {
        Chunk chunk;
        bool chunkFound = false;

        while (!mDone && !(chunkFound = findChunkToWrite(&chunk))) {
            mChunkReadyCondition.wait(mLock);
        }

        // In real time recording mode, write without holding the lock in order
        // to reduce the blocking time for media track threads.
        // Otherwise, hold the lock until the existing chunks get written to the
        // file.
        if (chunkFound) {
            if (mIsRealTimeRecording) {
                mLock.unlock();
            }
            writeChunkToFile(&chunk);
            if (mIsRealTimeRecording) {
                mLock.lock();
            }
        }
    }

    writeAllChunks();
}

status_t MPEG4MemoryWriter::startWriterThread() {
    ALOGV("startWriterThread");

    mDone = false;
    mIsFirstChunk = true;
    mDriftTimeUs = 0;
    for (List<Track *>::iterator it = mTracks.begin();
         it != mTracks.end(); ++it) {
        ChunkInfo info;
        info.mTrack = *it;
        info.mPrevChunkTimestampUs = 0;
        info.mMaxInterChunkDurUs = 0;
        mChunkInfos.push_back(info);
    }

    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_JOINABLE);
    pthread_create(&mThread, &attr, ThreadWrapper, this);
    pthread_attr_destroy(&attr);
    mWriterThreadStarted = true;
    return OK;
}


status_t MPEG4MemoryWriter::Track::start(MetaData *params) {
    if (!mDone && mPaused) {
        mPaused = false;
        mResumed = true;
        return OK;
    }

    int64_t startTimeUs;
    if (params == NULL || !params->findInt64(kKeyTime, &startTimeUs)) {
        startTimeUs = 0;
    }
    mStartTimeRealUs = startTimeUs;

    int32_t rotationDegrees;
    if (!mIsAudio && params && params->findInt32(kKeyRotation, &rotationDegrees)) {
        mRotation = rotationDegrees;
    }

    initTrackingProgressStatus(params);

    sp<MetaData> meta = new MetaData;
    if (mOwner->isRealTimeRecording() && mOwner->numTracks() > 1) {
        /*
         * This extra delay of accepting incoming audio/video signals
         * helps to align a/v start time at the beginning of a recording
         * session, and it also helps eliminate the "recording" sound for
         * camcorder applications.
         *
         * If client does not set the start time offset, we fall back to
         * use the default initial delay value.
         */
        int64_t startTimeOffsetUs = mOwner->getStartTimeOffsetMs() * 1000LL;
        if (startTimeOffsetUs < 0) {  // Start time offset was not set
            startTimeOffsetUs = kInitialDelayTimeUs;
        }
        startTimeUs += startTimeOffsetUs;
        ALOGI("Start time offset: %" PRId64 " us", startTimeOffsetUs);
    }

    meta->setInt64(kKeyTime, startTimeUs);

    status_t err = mSource->start(meta.get());
    if (err != OK) {
        mDone = mReachedEOS = true;
        return err;
    }

    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_JOINABLE);

    mDone = false;
    mStarted = true;
    mTrackDurationUs = 0;
    mReachedEOS = false;
    mEstimatedTrackSizeBytes = 0;
    mMdatSizeBytes = 0;
    mMaxChunkDurationUs = 0;

    pthread_create(&mThread, &attr, ThreadWrapper, this);
    pthread_attr_destroy(&attr);

    return OK;
}

status_t MPEG4MemoryWriter::Track::pause() {
    mPaused = true;
    return OK;
}

status_t MPEG4MemoryWriter::Track::stop() {
    ALOGD("%s track stopping", mIsAudio? "Audio": "Video");
    if (!mStarted) {
        ALOGE("Stop() called but track is not started");
        return ERROR_END_OF_STREAM;
    }

    if (mDone) {
        return OK;
    }
    mDone = true;

    ALOGD("%s track source stopping", mIsAudio? "Audio": "Video");
    mSource->stop();
    ALOGD("%s track source stopped", mIsAudio? "Audio": "Video");

    void *dummy;
    pthread_join(mThread, &dummy);
    status_t err = static_cast<status_t>(reinterpret_cast<uintptr_t>(dummy));

    ALOGD("%s track stopped", mIsAudio? "Audio": "Video");
    return err;
}

bool MPEG4MemoryWriter::Track::reachedEOS() {
    return mReachedEOS;
}

// static
void *MPEG4MemoryWriter::Track::ThreadWrapper(void *me) {
    Track *track = static_cast<Track *>(me);

    status_t err = track->threadEntry();
    return (void *)(uintptr_t)err;
}

static void getNalUnitType(uint8_t byte, uint8_t* type) {
    ALOGV("getNalUnitType: %d", byte);

    // nal_unit_type: 5-bit unsigned integer
    *type = (byte & 0x1F);
}

static const uint8_t *findNextStartCode(
        const uint8_t *data, size_t length) {

    ALOGV("findNextStartCode: %p %zu", data, length);

    size_t bytesLeft = length;
    while (bytesLeft > 4  &&
            memcmp("\x00\x00\x00\x01", &data[length - bytesLeft], 4)) {
        --bytesLeft;
    }
    if (bytesLeft <= 4) {
        bytesLeft = 0; // Last parameter set
    }
    return &data[length - bytesLeft];
}

const uint8_t *MPEG4MemoryWriter::Track::parseParamSet(
        const uint8_t *data, size_t length, int type, size_t *paramSetLen) {

    ALOGV("parseParamSet");
    CHECK(type == kNalUnitTypeSeqParamSet ||
          type == kNalUnitTypePicParamSet);

    const uint8_t *nextStartCode = findNextStartCode(data, length);
    *paramSetLen = nextStartCode - data;
    if (*paramSetLen == 0) {
        ALOGE("Param set is malformed, since its length is 0");
        return NULL;
    }

    AVCParamSet paramSet(*paramSetLen, data);
    if (type == kNalUnitTypeSeqParamSet) {
        if (*paramSetLen < 4) {
            ALOGE("Seq parameter set malformed");
            return NULL;
        }
        if (mSeqParamSets.empty()) {
            mProfileIdc = data[1];
            mProfileCompatible = data[2];
            mLevelIdc = data[3];
        } else {
            if (mProfileIdc != data[1] ||
                mProfileCompatible != data[2] ||
                mLevelIdc != data[3]) {
                ALOGE("Inconsistent profile/level found in seq parameter sets");
                return NULL;
            }
        }
        mSeqParamSets.push_back(paramSet);
    } else {
        mPicParamSets.push_back(paramSet);
    }
    return nextStartCode;
}

status_t MPEG4MemoryWriter::Track::copyAVCCodecSpecificData(
        const uint8_t *data, size_t size) {
    ALOGV("copyAVCCodecSpecificData");

    // 2 bytes for each of the parameter set length field
    // plus the 7 bytes for the header
    if (size < 4 + 7) {
        ALOGE("Codec specific data length too short: %zu", size);
        return ERROR_MALFORMED;
    }

    mCodecSpecificDataSize = size;
    mCodecSpecificData = malloc(size);
    memcpy(mCodecSpecificData, data, size);
    return OK;
}

status_t MPEG4MemoryWriter::Track::parseAVCCodecSpecificData(
        const uint8_t *data, size_t size) {

    ALOGV("parseAVCCodecSpecificData");
    // Data starts with a start code.
    // SPS and PPS are separated with start codes.
    // Also, SPS must come before PPS
    uint8_t type = kNalUnitTypeSeqParamSet;
    bool gotSps = false;
    bool gotPps = false;
    const uint8_t *tmp = data;
    const uint8_t *nextStartCode = data;
    size_t bytesLeft = size;
    size_t paramSetLen = 0;
    mCodecSpecificDataSize = 0;
    while (bytesLeft > 4 && !memcmp("\x00\x00\x00\x01", tmp, 4)) {
        getNalUnitType(*(tmp + 4), &type);
        if (type == kNalUnitTypeSeqParamSet) {
            if (gotPps) {
                ALOGE("SPS must come before PPS");
                return ERROR_MALFORMED;
            }
            if (!gotSps) {
                gotSps = true;
            }
            nextStartCode = parseParamSet(tmp + 4, bytesLeft - 4, type, &paramSetLen);
        } else if (type == kNalUnitTypePicParamSet) {
            if (!gotSps) {
                ALOGE("SPS must come before PPS");
                return ERROR_MALFORMED;
            }
            if (!gotPps) {
                gotPps = true;
            }
            nextStartCode = parseParamSet(tmp + 4, bytesLeft - 4, type, &paramSetLen);
        } else {
            ALOGE("Only SPS and PPS Nal units are expected");
            return ERROR_MALFORMED;
        }

        if (nextStartCode == NULL) {
            return ERROR_MALFORMED;
        }

        // Move on to find the next parameter set
        bytesLeft -= nextStartCode - tmp;
        tmp = nextStartCode;
        mCodecSpecificDataSize += (2 + paramSetLen);
    }

    {
        // Check on the number of seq parameter sets
        size_t nSeqParamSets = mSeqParamSets.size();
        if (nSeqParamSets == 0) {
            ALOGE("Cound not find sequence parameter set");
            return ERROR_MALFORMED;
        }

        if (nSeqParamSets > 0x1F) {
            ALOGE("Too many seq parameter sets (%zu) found", nSeqParamSets);
            return ERROR_MALFORMED;
        }
    }

    {
        // Check on the number of pic parameter sets
        size_t nPicParamSets = mPicParamSets.size();
        if (nPicParamSets == 0) {
            ALOGE("Cound not find picture parameter set");
            return ERROR_MALFORMED;
        }
        if (nPicParamSets > 0xFF) {
            ALOGE("Too many pic parameter sets (%zd) found", nPicParamSets);
            return ERROR_MALFORMED;
        }
    }
// FIXME:
// Add chromat_format_idc, bit depth values, etc for AVC/h264 high profile and above
// and remove #if 0
#if 0
    {
        // Check on the profiles
        // These profiles requires additional parameter set extensions
        if (mProfileIdc == 100 || mProfileIdc == 110 ||
            mProfileIdc == 122 || mProfileIdc == 144) {
            ALOGE("Sorry, no support for profile_idc: %d!", mProfileIdc);
            return BAD_VALUE;
        }
    }
#endif
    return OK;
}

status_t MPEG4MemoryWriter::Track::makeAVCCodecSpecificData(
        const uint8_t *data, size_t size) {

    if (mCodecSpecificData != NULL) {
        ALOGE("Already have codec specific data");
        return ERROR_MALFORMED;
    }

    if (size < 4) {
        ALOGE("Codec specific data length too short: %zu", size);
        return ERROR_MALFORMED;
    }

#if 0
    // Data is in the form of AVCCodecSpecificData
    if (memcmp("\x00\x00\x00\x01", data, 4)) {
        return copyAVCCodecSpecificData(data, size);
    }
#endif

    if (parseAVCCodecSpecificData(data, size) != OK) {
        return ERROR_MALFORMED;
    }

    // ISO 14496-15: AVC file format
    mCodecSpecificDataSize += 7;  // 7 more bytes in the header
    mCodecSpecificData = malloc(mCodecSpecificDataSize);
    uint8_t *header = (uint8_t *)mCodecSpecificData;
    header[0] = 1;                     // version
    header[1] = mProfileIdc;           // profile indication
    header[2] = mProfileCompatible;    // profile compatibility
    header[3] = mLevelIdc;

    // 6-bit '111111' followed by 2-bit to lengthSizeMinuusOne
    if (mOwner->useNalLengthFour()) {
        header[4] = 0xfc | 3;  // length size == 4 bytes
    } else {
        header[4] = 0xfc | 1;  // length size == 2 bytes
    }

    // 3-bit '111' followed by 5-bit numSequenceParameterSets
    int nSequenceParamSets = mSeqParamSets.size();
    header[5] = 0xe0 | nSequenceParamSets;
    header += 6;
    for (List<AVCParamSet>::iterator it = mSeqParamSets.begin();
         it != mSeqParamSets.end(); ++it) {
        // 16-bit sequence parameter set length
        uint16_t seqParamSetLength = it->mLength;
        header[0] = seqParamSetLength >> 8;
        header[1] = seqParamSetLength & 0xff;

        // SPS NAL unit (sequence parameter length bytes)
        memcpy(&header[2], it->mData, seqParamSetLength);
        header += (2 + seqParamSetLength);
    }

    // 8-bit nPictureParameterSets
    int nPictureParamSets = mPicParamSets.size();
    header[0] = nPictureParamSets;
    header += 1;
    for (List<AVCParamSet>::iterator it = mPicParamSets.begin();
         it != mPicParamSets.end(); ++it) {
        // 16-bit picture parameter set length
        uint16_t picParamSetLength = it->mLength;
        header[0] = picParamSetLength >> 8;
        header[1] = picParamSetLength & 0xff;

        // PPS Nal unit (picture parameter set length bytes)
        memcpy(&header[2], it->mData, picParamSetLength);
        header += (2 + picParamSetLength);
    }

    return OK;
}

/*
 * Updates the drift time from the audio track so that
 * the video track can get the updated drift time information
 * from the file writer. The fluctuation of the drift time of the audio
 * encoding path is smoothed out with a simple filter by giving a larger
 * weight to more recently drift time. The filter coefficients, 0.5 and 0.5,
 * are heuristically determined.
 */
void MPEG4MemoryWriter::Track::updateDriftTime(const sp<MetaData>& meta) {
    int64_t driftTimeUs = 0;
    if (meta->findInt64(kKeyDriftTime, &driftTimeUs)) {
        int64_t prevDriftTimeUs = mOwner->getDriftTimeUs();
        int64_t timeUs = (driftTimeUs + prevDriftTimeUs) >> 1;
        mOwner->setDriftTimeUs(timeUs);
    }
}

status_t MPEG4MemoryWriter::Track::threadEntry() {
    int32_t count = 0;
    const int64_t interleaveDurationUs = mOwner->interleaveDuration();
    const bool hasMultipleTracks = (mOwner->numTracks() > 1);
    int64_t chunkTimestampUs = 0;
    int32_t nChunks = 0;
    int32_t nZeroLengthFrames = 0;
    int64_t lastTimestampUs = 0;      // Previous sample time stamp
    int64_t lastDurationUs = 0;       // Between the previous two samples
    int64_t currDurationTicks = 0;    // Timescale based ticks
    int64_t lastDurationTicks = 0;    // Timescale based ticks
    int32_t sampleCount = 1;          // Sample count in the current stts table entry
    uint32_t previousSampleSize = 0;  // Size of the previous sample
    int64_t previousPausedDurationUs = 0;
    int64_t timestampUs = 0;
    int64_t cttsOffsetTimeUs = 0;
    int64_t currCttsOffsetTimeTicks = 0;   // Timescale based ticks
    int64_t lastCttsOffsetTimeTicks = -1;  // Timescale based ticks
    int32_t cttsSampleCount = 0;           // Sample count in the current ctts table entry
    uint32_t lastSamplesPerChunk = 0;

    if (mIsAudio) {
        prctl(PR_SET_NAME, (unsigned long)"AudioTrackEncoding", 0, 0, 0);
    } else {
        prctl(PR_SET_NAME, (unsigned long)"VideoTrackEncoding", 0, 0, 0);
    }

    if (mOwner->isRealTimeRecording()) {
        androidSetThreadPriority(0, ANDROID_PRIORITY_AUDIO);
    }

    sp<MetaData> meta_data;

    status_t err = OK;
    MediaBuffer *buffer;
    const char *trackName = mIsAudio ? "Audio" : "Video";
    while (!mDone && (err = mSource->read(&buffer)) == OK) {
        if (buffer->range_length() == 0) {
            buffer->release();
            buffer = NULL;
            ++nZeroLengthFrames;
            continue;
        }

        // If the codec specific data has not been received yet, delay pause.
        // After the codec specific data is received, discard what we received
        // when the track is to be paused.
        if (mPaused && !mResumed) {
            buffer->release();
            buffer = NULL;
            continue;
        }

        ++count;

        int32_t isCodecConfig;
        if (buffer->meta_data()->findInt32(kKeyIsCodecConfig, &isCodecConfig)
                && isCodecConfig) {
            CHECK(!mGotAllCodecSpecificData);

            if (mIsAvc) {
                status_t err = makeAVCCodecSpecificData(
                        (const uint8_t *)buffer->data()
                            + buffer->range_offset(),
                        buffer->range_length());
                CHECK_EQ((status_t)OK, err);
            } else if (mIsMPEG4) {
                mCodecSpecificDataSize = buffer->range_length();
                mCodecSpecificData = malloc(mCodecSpecificDataSize);
                memcpy(mCodecSpecificData,
                        (const uint8_t *)buffer->data()
                            + buffer->range_offset(),
                       buffer->range_length());
            }

            buffer->release();
            buffer = NULL;

            mGotAllCodecSpecificData = true;
            continue;
        }

        // Make a deep copy of the MediaBuffer and Metadata and release
        // the original as soon as we can
        MediaBuffer *copy = new MediaBuffer(buffer->range_length());
        memcpy(copy->data(), (uint8_t *)buffer->data() + buffer->range_offset(),
                buffer->range_length());
        copy->set_range(0, buffer->range_length());
        meta_data = new MetaData(*buffer->meta_data().get());
        buffer->release();
        buffer = NULL;

        if (mIsAvc) StripStartcode(copy);

        size_t sampleSize = copy->range_length();
        if (mIsAvc) {
            if (mOwner->useNalLengthFour()) {
                sampleSize += 4;
            } else {
                sampleSize += 2;
            }
        }

        // Max file size or duration handling
        mMdatSizeBytes += sampleSize;

        int32_t isSync = false;
        meta_data->findInt32(kKeyIsSyncFrame, &isSync);
        CHECK(meta_data->findInt64(kKeyTime, &timestampUs));

////////////////////////////////////////////////////////////////////////////////
        if (mStszTableEntries->count() == 0) {
            mFirstSampleTimeRealUs = systemTime() / 1000;
            mStartTimestampUs = timestampUs;
            mOwner->setStartTimestampUs(mStartTimestampUs);
            previousPausedDurationUs = mStartTimestampUs;
        }

        if (mResumed) {
            int64_t durExcludingEarlierPausesUs = timestampUs - previousPausedDurationUs;
            if (WARN_UNLESS(durExcludingEarlierPausesUs >= 0ll, "for %s track", trackName)) {
                copy->release();
                return ERROR_MALFORMED;
            }

            int64_t pausedDurationUs = durExcludingEarlierPausesUs - mTrackDurationUs;
            if (WARN_UNLESS(pausedDurationUs >= lastDurationUs, "for %s track", trackName)) {
                copy->release();
                return ERROR_MALFORMED;
            }

            previousPausedDurationUs += pausedDurationUs - lastDurationUs;
            mResumed = false;
        }

        timestampUs -= previousPausedDurationUs;
        if (WARN_UNLESS(timestampUs >= 0ll, "for %s track", trackName)) {
            copy->release();
            return ERROR_MALFORMED;
        }

        if (!mIsAudio) {
            /*
             * Composition time: timestampUs
             * Decoding time: decodingTimeUs
             * Composition time offset = composition time - decoding time
             */
            int64_t decodingTimeUs;
            CHECK(meta_data->findInt64(kKeyDecodingTime, &decodingTimeUs));
            decodingTimeUs -= previousPausedDurationUs;
            cttsOffsetTimeUs =
                    timestampUs + kMaxCttsOffsetTimeUs - decodingTimeUs;
            if (WARN_UNLESS(cttsOffsetTimeUs >= 0ll, "for %s track", trackName)) {
                copy->release();
                return ERROR_MALFORMED;
            }

            timestampUs = decodingTimeUs;
            ALOGV("decoding time: %" PRId64 " and ctts offset time: %" PRId64,
                timestampUs, cttsOffsetTimeUs);

            // Update ctts box table if necessary
            currCttsOffsetTimeTicks =
                    (cttsOffsetTimeUs * mTimeScale + 500000LL) / 1000000LL;
            if (WARN_UNLESS(currCttsOffsetTimeTicks <= 0x0FFFFFFFFLL, "for %s track", trackName)) {
                copy->release();
                return ERROR_MALFORMED;
            }

            if (mStszTableEntries->count() == 0) {
                // Force the first ctts table entry to have one single entry
                // so that we can do adjustment for the initial track start
                // time offset easily in writeCttsBox().
                lastCttsOffsetTimeTicks = currCttsOffsetTimeTicks;
                addOneCttsTableEntry(1, currCttsOffsetTimeTicks);
                cttsSampleCount = 0;      // No sample in ctts box is pending
            } else {
                if (currCttsOffsetTimeTicks != lastCttsOffsetTimeTicks) {
                    addOneCttsTableEntry(cttsSampleCount, lastCttsOffsetTimeTicks);
                    lastCttsOffsetTimeTicks = currCttsOffsetTimeTicks;
                    cttsSampleCount = 1;  // One sample in ctts box is pending
                } else {
                    ++cttsSampleCount;
                }
            }

            // Update ctts time offset range
            if (mStszTableEntries->count() == 0) {
                mMinCttsOffsetTimeUs = currCttsOffsetTimeTicks;
                mMaxCttsOffsetTimeUs = currCttsOffsetTimeTicks;
            } else {
                if (currCttsOffsetTimeTicks > mMaxCttsOffsetTimeUs) {
                    mMaxCttsOffsetTimeUs = currCttsOffsetTimeTicks;
                } else if (currCttsOffsetTimeTicks < mMinCttsOffsetTimeUs) {
                    mMinCttsOffsetTimeUs = currCttsOffsetTimeTicks;
                }
            }

        }

        if (mOwner->isRealTimeRecording()) {
            if (mIsAudio) {
                updateDriftTime(meta_data);
            }
        }

        if (WARN_UNLESS(timestampUs >= 0ll, "for %s track", trackName)) {
            copy->release();
            return ERROR_MALFORMED;
        }

        ALOGV("%s media time stamp: %" PRId64 " and previous paused duration %" PRId64,
                trackName, timestampUs, previousPausedDurationUs);
        if (timestampUs > mTrackDurationUs) {
            mTrackDurationUs = timestampUs;
        }

        // We need to use the time scale based ticks, rather than the
        // timestamp itself to determine whether we have to use a new
        // stts entry, since we may have rounding errors.
        // The calculation is intended to reduce the accumulated
        // rounding errors.
        currDurationTicks =
            ((timestampUs * mTimeScale + 500000LL) / 1000000LL -
                (lastTimestampUs * mTimeScale + 500000LL) / 1000000LL);
        if (currDurationTicks < 0ll) {
            ALOGE("timestampUs %" PRId64 " < lastTimestampUs %" PRId64 " for %s track",
                timestampUs, lastTimestampUs, trackName);
            copy->release();
            return UNKNOWN_ERROR;
        }

        // if the duration is different for this sample, see if it is close enough to the previous
        // duration that we can fudge it and use the same value, to avoid filling the stts table
        // with lots of near-identical entries.
        // "close enough" here means that the current duration needs to be adjusted by less
        // than 0.1 milliseconds
        if (lastDurationTicks && (currDurationTicks != lastDurationTicks)) {
            int64_t deltaUs = ((lastDurationTicks - currDurationTicks) * 1000000LL
                    + (mTimeScale / 2)) / mTimeScale;
            if (deltaUs > -100 && deltaUs < 100) {
                // use previous ticks, and adjust timestamp as if it was actually that number
                // of ticks
                currDurationTicks = lastDurationTicks;
                timestampUs += deltaUs;
            }
        }

        mStszTableEntries->add(htonl(sampleSize));
        if (mStszTableEntries->count() > 2) {

            // Force the first sample to have its own stts entry so that
            // we can adjust its value later to maintain the A/V sync.
            if (mStszTableEntries->count() == 3 || currDurationTicks != lastDurationTicks) {
                addOneSttsTableEntry(sampleCount, lastDurationTicks);
                sampleCount = 1;
            } else {
                ++sampleCount;
            }

        }
        if (mSamplesHaveSameSize) {
            if (mStszTableEntries->count() >= 2 && previousSampleSize != sampleSize) {
                mSamplesHaveSameSize = false;
            }
            previousSampleSize = sampleSize;
        }
        ALOGV("%s timestampUs/lastTimestampUs: %" PRId64 "/%" PRId64,
                trackName, timestampUs, lastTimestampUs);
        lastDurationUs = timestampUs - lastTimestampUs;
        lastDurationTicks = currDurationTicks;
        lastTimestampUs = timestampUs;

        if (isSync != 0) {
            addOneStssTableEntry(mStszTableEntries->count());
        }

        if (mTrackingProgressStatus) {
            if (mPreviousTrackTimeUs <= 0) {
                mPreviousTrackTimeUs = mStartTimestampUs;
            }
            trackProgressStatus(timestampUs);
        }
        if (!hasMultipleTracks) {
            off64_t offset = mIsAvc? mOwner->addLengthPrefixedSample_l(copy)
                                 : mOwner->addSample_l(copy);

            uint32_t count = (mOwner->use32BitFileOffset()
                        ? mStcoTableEntries->count()
                        : mCo64TableEntries->count());

            if (count == 0) {
                addChunkOffset(offset);
            }
            copy->release();
            copy = NULL;
            continue;
        }

        mChunkSamples.push_back(copy);
        if (interleaveDurationUs == 0) {
            addOneStscTableEntry(++nChunks, 1);
            bufferChunk(timestampUs);
        } else {
            if (chunkTimestampUs == 0) {
                chunkTimestampUs = timestampUs;
            } else {
                int64_t chunkDurationUs = timestampUs - chunkTimestampUs;
                if (chunkDurationUs > interleaveDurationUs) {
                    if (chunkDurationUs > mMaxChunkDurationUs) {
                        mMaxChunkDurationUs = chunkDurationUs;
                    }
                    ++nChunks;
                    if (nChunks == 1 ||  // First chunk
                        lastSamplesPerChunk != mChunkSamples.size()) {
                        lastSamplesPerChunk = mChunkSamples.size();
                        addOneStscTableEntry(nChunks, lastSamplesPerChunk);
                    }
                    bufferChunk(timestampUs);
                    chunkTimestampUs = timestampUs;
                }
            }
        }

    }

    if (isTrackMalFormed()) {
        err = ERROR_MALFORMED;
    }

    mOwner->trackProgressStatus(mTrackId, -1, err);

    // Last chunk
    if (!hasMultipleTracks) {
        addOneStscTableEntry(1, mStszTableEntries->count());
    } else if (!mChunkSamples.empty()) {
        addOneStscTableEntry(++nChunks, mChunkSamples.size());
        bufferChunk(timestampUs);
    }

    // We don't really know how long the last frame lasts, since
    // there is no frame time after it, just repeat the previous
    // frame's duration.
    if (mStszTableEntries->count() == 1) {
        lastDurationUs = 0;  // A single sample's duration
        lastDurationTicks = 0;
    } else {
        ++sampleCount;  // Count for the last sample
    }

    if (mStszTableEntries->count() <= 2) {
        addOneSttsTableEntry(1, lastDurationTicks);
        if (sampleCount - 1 > 0) {
            addOneSttsTableEntry(sampleCount - 1, lastDurationTicks);
        }
    } else {
        addOneSttsTableEntry(sampleCount, lastDurationTicks);
    }

    // The last ctts box may not have been written yet, and this
    // is to make sure that we write out the last ctts box.
    if (currCttsOffsetTimeTicks == lastCttsOffsetTimeTicks) {
        if (cttsSampleCount > 0) {
            addOneCttsTableEntry(cttsSampleCount, lastCttsOffsetTimeTicks);
        }
    }

    mTrackDurationUs += lastDurationUs;
    mReachedEOS = true;

    sendTrackSummary(hasMultipleTracks);

    ALOGI("Received total/0-length (%d/%d) buffers and encoded %d frames. - %s",
            count, nZeroLengthFrames, mStszTableEntries->count(), trackName);
    if (mIsAudio) {
        ALOGI("Audio track drift time: %" PRId64 " us", mOwner->getDriftTimeUs());
    }

    if (err == ERROR_END_OF_STREAM) {
        return OK;
    }
    return err;
}

bool MPEG4MemoryWriter::Track::isTrackMalFormed() const {
    if (mStszTableEntries->count() == 0) {                      // no samples written
        ALOGE("The number of recorded samples is 0");
        return true;
    }

    if (!mIsAudio && mStssTableEntries->count() == 0) {  // no sync frames for video
        ALOGE("There are no sync frames for video track");
        return true;
    }

    if (OK != checkCodecSpecificData()) {         // no codec specific data
        return true;
    }

    return false;
}

void MPEG4MemoryWriter::Track::sendTrackSummary(bool hasMultipleTracks) {

    // Send track summary only if test mode is enabled.
    if (!isTestModeEnabled()) {
        return;
    }

    int trackNum = (mTrackId << 28);

    mOwner->notify(MEDIA_RECORDER_TRACK_EVENT_INFO,
                    trackNum | MEDIA_RECORDER_TRACK_INFO_TYPE,
                    mIsAudio? 0: 1);

    mOwner->notify(MEDIA_RECORDER_TRACK_EVENT_INFO,
                    trackNum | MEDIA_RECORDER_TRACK_INFO_DURATION_MS,
                    mTrackDurationUs / 1000);

    mOwner->notify(MEDIA_RECORDER_TRACK_EVENT_INFO,
                    trackNum | MEDIA_RECORDER_TRACK_INFO_ENCODED_FRAMES,
                    mStszTableEntries->count());

    {
        // The system delay time excluding the requested initial delay that
        // is used to eliminate the recording sound.
        int64_t startTimeOffsetUs = mOwner->getStartTimeOffsetMs() * 1000LL;
        if (startTimeOffsetUs < 0) {  // Start time offset was not set
            startTimeOffsetUs = kInitialDelayTimeUs;
        }
        int64_t initialDelayUs =
            mFirstSampleTimeRealUs - mStartTimeRealUs - startTimeOffsetUs;

        mOwner->notify(MEDIA_RECORDER_TRACK_EVENT_INFO,
                    trackNum | MEDIA_RECORDER_TRACK_INFO_INITIAL_DELAY_MS,
                    (initialDelayUs) / 1000);
    }

    mOwner->notify(MEDIA_RECORDER_TRACK_EVENT_INFO,
                    trackNum | MEDIA_RECORDER_TRACK_INFO_DATA_KBYTES,
                    mMdatSizeBytes / 1024);

    if (hasMultipleTracks) {
        mOwner->notify(MEDIA_RECORDER_TRACK_EVENT_INFO,
                    trackNum | MEDIA_RECORDER_TRACK_INFO_MAX_CHUNK_DUR_MS,
                    mMaxChunkDurationUs / 1000);

        int64_t moovStartTimeUs = mOwner->getStartTimestampUs();
        if (mStartTimestampUs != moovStartTimeUs) {
            int64_t startTimeOffsetUs = mStartTimestampUs - moovStartTimeUs;
            mOwner->notify(MEDIA_RECORDER_TRACK_EVENT_INFO,
                    trackNum | MEDIA_RECORDER_TRACK_INFO_START_OFFSET_MS,
                    startTimeOffsetUs / 1000);
        }
    }
}

void MPEG4MemoryWriter::Track::trackProgressStatus(int64_t timeUs, status_t err) {
    ALOGV("trackProgressStatus: %" PRId64 " us", timeUs);

    if (mTrackEveryTimeDurationUs > 0 &&
        timeUs - mPreviousTrackTimeUs >= mTrackEveryTimeDurationUs) {
        ALOGV("Fire time tracking progress status at %" PRId64 " us", timeUs);
        mOwner->trackProgressStatus(mTrackId, timeUs - mPreviousTrackTimeUs, err);
        mPreviousTrackTimeUs = timeUs;
    }
}

void MPEG4MemoryWriter::trackProgressStatus(
        size_t trackId, int64_t timeUs, status_t err) {
    Mutex::Autolock lock(mLock);
    int32_t trackNum = (trackId << 28);

    // Error notification
    // Do not consider ERROR_END_OF_STREAM an error
    if (err != OK && err != ERROR_END_OF_STREAM) {
        notify(MEDIA_RECORDER_TRACK_EVENT_ERROR,
               trackNum | MEDIA_RECORDER_TRACK_ERROR_GENERAL,
               err);
        return;
    }

    if (timeUs == -1) {
        // Send completion notification
        notify(MEDIA_RECORDER_TRACK_EVENT_INFO,
               trackNum | MEDIA_RECORDER_TRACK_INFO_COMPLETION_STATUS,
               err);
    } else {
        // Send progress status
        notify(MEDIA_RECORDER_TRACK_EVENT_INFO,
               trackNum | MEDIA_RECORDER_TRACK_INFO_PROGRESS_IN_TIME,
               timeUs / 1000);
    }
}

void MPEG4MemoryWriter::setDriftTimeUs(int64_t driftTimeUs) {
    ALOGV("setDriftTimeUs: %" PRId64 " us", driftTimeUs);
    Mutex::Autolock autolock(mLock);
    mDriftTimeUs = driftTimeUs;
}

int64_t MPEG4MemoryWriter::getDriftTimeUs() {
    ALOGV("getDriftTimeUs: %" PRId64 " us", mDriftTimeUs);
    Mutex::Autolock autolock(mLock);
    return mDriftTimeUs;
}

bool MPEG4MemoryWriter::isRealTimeRecording() const {
    return mIsRealTimeRecording;
}

bool MPEG4MemoryWriter::useNalLengthFour() {
    return mUse4ByteNalLength;
}

void MPEG4MemoryWriter::Track::bufferChunk(int64_t timestampUs) {
    ALOGV("bufferChunk");

    Chunk chunk(this, timestampUs, mChunkSamples);
    mOwner->bufferChunk(chunk);
    mChunkSamples.clear();
}

int64_t MPEG4MemoryWriter::Track::getDurationUs() const {
    return mTrackDurationUs;
}

int64_t MPEG4MemoryWriter::Track::getEstimatedTrackSizeBytes() const {
    return mEstimatedTrackSizeBytes;
}

status_t MPEG4MemoryWriter::Track::checkCodecSpecificData() const {
    const char *mime;
    CHECK(mMeta->findCString(kKeyMIMEType, &mime));
    if (!strcasecmp(MEDIA_MIMETYPE_AUDIO_AAC, mime) ||
        !strcasecmp(MEDIA_MIMETYPE_VIDEO_MPEG4, mime) ||
        !strcasecmp(MEDIA_MIMETYPE_VIDEO_AVC, mime)) {
        if (!mCodecSpecificData ||
            mCodecSpecificDataSize <= 0) {
            ALOGE("Missing codec specific data");
            return ERROR_MALFORMED;
        }
    } else {
        if (mCodecSpecificData ||
            mCodecSpecificDataSize > 0) {
            ALOGE("Unexepected codec specific data found");
            return ERROR_MALFORMED;
        }
    }
    return OK;
}

void MPEG4MemoryWriter::Track::writeTrackHeader(bool use32BitOffset) {

    ALOGV("%s track time scale: %d",
        mIsAudio? "Audio": "Video", mTimeScale);

    mOwner->beginBox("trak");
        writeTkhdBox(0);
        mOwner->beginBox("mdia");
            writeMdhdBox(0);
            writeHdlrBox();
            mOwner->beginBox("minf");
                if (mIsAudio) {
                    writeSmhdBox();
                } else {
                    writeVmhdBox();
                }
                writeDinfBox();
                writeStblBox(use32BitOffset);
            mOwner->endBox();  // minf
        mOwner->endBox();  // mdia
    mOwner->endBox();  // trak
}

void MPEG4MemoryWriter::Track::writeStblBox(bool use32BitOffset) {
    mOwner->beginBox("stbl");
    mOwner->beginBox("stsd");
    mOwner->writeInt32(0);               // version=0, flags=0
    mOwner->writeInt32(1);               // entry count
    if (mIsAudio) {
        writeAudioFourCCBox();
    } else {
        writeVideoFourCCBox();
    }
    mOwner->endBox();  // stsd
    writeSttsBox();
    writeCttsBox();
    if (!mIsAudio) {
        writeStssBox();
    }
    writeStszBox();
    writeStscBox();
    writeStcoBox(use32BitOffset);
    mOwner->endBox();  // stbl
}

void MPEG4MemoryWriter::Track::writeVideoFourCCBox() {
    const char *mime;
    bool success = mMeta->findCString(kKeyMIMEType, &mime);
    CHECK(success);
    if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_MPEG4, mime)) {
        mOwner->beginBox("mp4v");
    } else if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_H263, mime)) {
        mOwner->beginBox("s263");
    } else if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_AVC, mime)) {
        mOwner->beginBox("avc1");
    } else {
        ALOGE("Unknown mime type '%s'.", mime);
        CHECK(!"should not be here, unknown mime type.");
    }

    mOwner->writeInt32(0);           // reserved
    mOwner->writeInt16(0);           // reserved
    mOwner->writeInt16(1);           // data ref index
    mOwner->writeInt16(0);           // predefined
    mOwner->writeInt16(0);           // reserved
    mOwner->writeInt32(0);           // predefined
    mOwner->writeInt32(0);           // predefined
    mOwner->writeInt32(0);           // predefined

    int32_t width, height;
    success = mMeta->findInt32(kKeyWidth, &width);
    success = success && mMeta->findInt32(kKeyHeight, &height);
    CHECK(success);

    mOwner->writeInt16(width);
    mOwner->writeInt16(height);
    mOwner->writeInt32(0x480000);    // horiz resolution
    mOwner->writeInt32(0x480000);    // vert resolution
    mOwner->writeInt32(0);           // reserved
    mOwner->writeInt16(1);           // frame count
    mOwner->writeInt8(0);            // compressor string length
    mOwner->write("                               ", 31);
    mOwner->writeInt16(0x18);        // depth
    mOwner->writeInt16(-1);          // predefined

    CHECK_LT(23 + mCodecSpecificDataSize, 128);

    if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_MPEG4, mime)) {
        writeMp4vEsdsBox();
    } else if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_H263, mime)) {
        writeD263Box();
    } else if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_AVC, mime)) {
        writeAvccBox();
    }

    writePaspBox();
    mOwner->endBox();  // mp4v, s263 or avc1
}

void MPEG4MemoryWriter::Track::writeAudioFourCCBox() {
    const char *mime;
    bool success = mMeta->findCString(kKeyMIMEType, &mime);
    CHECK(success);
    const char *fourcc = NULL;
    if (!strcasecmp(MEDIA_MIMETYPE_AUDIO_AMR_NB, mime)) {
        fourcc = "samr";
    } else if (!strcasecmp(MEDIA_MIMETYPE_AUDIO_AMR_WB, mime)) {
        fourcc = "sawb";
    } else if (!strcasecmp(MEDIA_MIMETYPE_AUDIO_AAC, mime)) {
        fourcc = "mp4a";
    } else {
        ALOGE("Unknown mime type '%s'.", mime);
        CHECK(!"should not be here, unknown mime type.");
    }

    mOwner->beginBox(fourcc);        // audio format
    mOwner->writeInt32(0);           // reserved
    mOwner->writeInt16(0);           // reserved
    mOwner->writeInt16(0x1);         // data ref index
    mOwner->writeInt32(0);           // reserved
    mOwner->writeInt32(0);           // reserved
    int32_t nChannels;
    CHECK_EQ(true, mMeta->findInt32(kKeyChannelCount, &nChannels));
    mOwner->writeInt16(nChannels);   // channel count
    mOwner->writeInt16(16);          // sample size
    mOwner->writeInt16(0);           // predefined
    mOwner->writeInt16(0);           // reserved

    int32_t samplerate;
    success = mMeta->findInt32(kKeySampleRate, &samplerate);
    CHECK(success);
    mOwner->writeInt32(samplerate << 16);
    if (!strcasecmp(MEDIA_MIMETYPE_AUDIO_AAC, mime)) {
        writeMp4aEsdsBox();
    } else if (!strcasecmp(MEDIA_MIMETYPE_AUDIO_AMR_NB, mime) ||
               !strcasecmp(MEDIA_MIMETYPE_AUDIO_AMR_WB, mime)) {
        writeDamrBox();
    }
    mOwner->endBox();
}

void MPEG4MemoryWriter::Track::writeMp4aEsdsBox() {
    mOwner->beginBox("esds");
    CHECK(mCodecSpecificData);
    CHECK_GT(mCodecSpecificDataSize, 0);

    // Make sure all sizes encode to a single byte.
    CHECK_LT(mCodecSpecificDataSize + 23, 128);

    mOwner->writeInt32(0);     // version=0, flags=0
    mOwner->writeInt8(0x03);   // ES_DescrTag
    mOwner->writeInt8(23 + mCodecSpecificDataSize);
    mOwner->writeInt16(0x0000);// ES_ID
    mOwner->writeInt8(0x00);

    mOwner->writeInt8(0x04);   // DecoderConfigDescrTag
    mOwner->writeInt8(15 + mCodecSpecificDataSize);
    mOwner->writeInt8(0x40);   // objectTypeIndication ISO/IEC 14492-2
    mOwner->writeInt8(0x15);   // streamType AudioStream

    mOwner->writeInt16(0x03);  // XXX
    mOwner->writeInt8(0x00);   // buffer size 24-bit
    mOwner->writeInt32(96000); // max bit rate
    mOwner->writeInt32(96000); // avg bit rate

    mOwner->writeInt8(0x05);   // DecoderSpecificInfoTag
    mOwner->writeInt8(mCodecSpecificDataSize);
    mOwner->write(mCodecSpecificData, mCodecSpecificDataSize);

    static const uint8_t kData2[] = {
        0x06,  // SLConfigDescriptorTag
        0x01,
        0x02
    };
    mOwner->write(kData2, sizeof(kData2));

    mOwner->endBox();  // esds
}

void MPEG4MemoryWriter::Track::writeMp4vEsdsBox() {
    CHECK(mCodecSpecificData);
    CHECK_GT(mCodecSpecificDataSize, 0);
    mOwner->beginBox("esds");

    mOwner->writeInt32(0);    // version=0, flags=0

    mOwner->writeInt8(0x03);  // ES_DescrTag
    mOwner->writeInt8(23 + mCodecSpecificDataSize);
    mOwner->writeInt16(0x0000);  // ES_ID
    mOwner->writeInt8(0x1f);

    mOwner->writeInt8(0x04);  // DecoderConfigDescrTag
    mOwner->writeInt8(15 + mCodecSpecificDataSize);
    mOwner->writeInt8(0x20);  // objectTypeIndication ISO/IEC 14492-2
    mOwner->writeInt8(0x11);  // streamType VisualStream

    static const uint8_t kData[] = {
        0x01, 0x77, 0x00,
        0x00, 0x03, 0xe8, 0x00,
        0x00, 0x03, 0xe8, 0x00
    };
    mOwner->write(kData, sizeof(kData));

    mOwner->writeInt8(0x05);  // DecoderSpecificInfoTag

    mOwner->writeInt8(mCodecSpecificDataSize);
    mOwner->write(mCodecSpecificData, mCodecSpecificDataSize);

    static const uint8_t kData2[] = {
        0x06,  // SLConfigDescriptorTag
        0x01,
        0x02
    };
    mOwner->write(kData2, sizeof(kData2));

    mOwner->endBox();  // esds
}

void MPEG4MemoryWriter::Track::writeTkhdBox(uint32_t now) {
    mOwner->beginBox("tkhd");
    // Flags = 7 to indicate that the track is enabled, and
    // part of the presentation
    mOwner->writeInt32(0x07);          // version=0, flags=7
    mOwner->writeInt32(now);           // creation time
    mOwner->writeInt32(now);           // modification time
    mOwner->writeInt32(mTrackId);      // track id starts with 1
    mOwner->writeInt32(0);             // reserved
    int64_t trakDurationUs = getDurationUs();
    int32_t mvhdTimeScale = mOwner->getTimeScale();
    int32_t tkhdDuration =
        (trakDurationUs * mvhdTimeScale + 5E5) / 1E6;
    mOwner->writeInt32(tkhdDuration);  // in mvhd timescale
    mOwner->writeInt32(0);             // reserved
    mOwner->writeInt32(0);             // reserved
    mOwner->writeInt16(0);             // layer
    mOwner->writeInt16(0);             // alternate group
    mOwner->writeInt16(mIsAudio ? 0x100 : 0);  // volume
    mOwner->writeInt16(0);             // reserved

    mOwner->writeCompositionMatrix(mRotation);       // matrix

    if (mIsAudio) {
        mOwner->writeInt32(0);
        mOwner->writeInt32(0);
    } else {
        int32_t width, height;
        bool success = mMeta->findInt32(kKeyWidth, &width);
        success = success && mMeta->findInt32(kKeyHeight, &height);
        CHECK(success);

        mOwner->writeInt32(width << 16);   // 32-bit fixed-point value
        mOwner->writeInt32(height << 16);  // 32-bit fixed-point value
    }
    mOwner->endBox();  // tkhd
}

void MPEG4MemoryWriter::Track::writeVmhdBox() {
    mOwner->beginBox("vmhd");
    mOwner->writeInt32(0x01);        // version=0, flags=1
    mOwner->writeInt16(0);           // graphics mode
    mOwner->writeInt16(0);           // opcolor
    mOwner->writeInt16(0);
    mOwner->writeInt16(0);
    mOwner->endBox();
}

void MPEG4MemoryWriter::Track::writeSmhdBox() {
    mOwner->beginBox("smhd");
    mOwner->writeInt32(0);           // version=0, flags=0
    mOwner->writeInt16(0);           // balance
    mOwner->writeInt16(0);           // reserved
    mOwner->endBox();
}

void MPEG4MemoryWriter::Track::writeHdlrBox() {
    mOwner->beginBox("hdlr");
    mOwner->writeInt32(0);             // version=0, flags=0
    mOwner->writeInt32(0);             // component type: should be mhlr
    mOwner->writeFourcc(mIsAudio ? "soun" : "vide");  // component subtype
    mOwner->writeInt32(0);             // reserved
    mOwner->writeInt32(0);             // reserved
    mOwner->writeInt32(0);             // reserved
    // Removing "r" for the name string just makes the string 4 byte aligned
    mOwner->writeCString(mIsAudio ? "SoundHandle": "VideoHandle");  // name
    mOwner->endBox();
}

void MPEG4MemoryWriter::Track::writeMdhdBox(uint32_t now) {
    int64_t trakDurationUs = getDurationUs();
    mOwner->beginBox("mdhd");
    mOwner->writeInt32(0);             // version=0, flags=0
    mOwner->writeInt32(now);           // creation time
    mOwner->writeInt32(now);           // modification time
    mOwner->writeInt32(mTimeScale);    // media timescale
    int32_t mdhdDuration = (trakDurationUs * mTimeScale + 5E5) / 1E6;
    mOwner->writeInt32(mdhdDuration);  // use media timescale
    // Language follows the three letter standard ISO-639-2/T
    // 'e', 'n', 'g' for "English", for instance.
    // Each character is packed as the difference between its ASCII value and 0x60.
    // For "English", these are 00101, 01110, 00111.
    // XXX: Where is the padding bit located: 0x15C7?
    mOwner->writeInt16(0x15c7);        // language code
    mOwner->writeInt16(0);             // predefined
    mOwner->endBox();
}

void MPEG4MemoryWriter::Track::writeDamrBox() {
    // 3gpp2 Spec AMRSampleEntry fields
    mOwner->beginBox("damr");
    mOwner->writeCString("   ");  // vendor: 4 bytes
    mOwner->writeInt8(0);         // decoder version
    mOwner->writeInt16(0x83FF);   // mode set: all enabled
    mOwner->writeInt8(0);         // mode change period
    mOwner->writeInt8(1);         // frames per sample
    mOwner->endBox();
}

void MPEG4MemoryWriter::Track::writeUrlBox() {
    // The table index here refers to the sample description index
    // in the sample table entries.
    mOwner->beginBox("url ");
    mOwner->writeInt32(1);  // version=0, flags=1 (self-contained)
    mOwner->endBox();  // url
}

void MPEG4MemoryWriter::Track::writeDrefBox() {
    mOwner->beginBox("dref");
    mOwner->writeInt32(0);  // version=0, flags=0
    mOwner->writeInt32(1);  // entry count (either url or urn)
    writeUrlBox();
    mOwner->endBox();  // dref
}

void MPEG4MemoryWriter::Track::writeDinfBox() {
    mOwner->beginBox("dinf");
    writeDrefBox();
    mOwner->endBox();  // dinf
}

void MPEG4MemoryWriter::Track::writeAvccBox() {
    CHECK(mCodecSpecificData);
    CHECK_GE(mCodecSpecificDataSize, 5);

    // Patch avcc's lengthSize field to match the number
    // of bytes we use to indicate the size of a nal unit.
    uint8_t *ptr = (uint8_t *)mCodecSpecificData;
    ptr[4] = (ptr[4] & 0xfc) | (mOwner->useNalLengthFour() ? 3 : 1);
    mOwner->beginBox("avcC");
    mOwner->write(mCodecSpecificData, mCodecSpecificDataSize);
    mOwner->endBox();  // avcC
}

void MPEG4MemoryWriter::Track::writeD263Box() {
    mOwner->beginBox("d263");
    mOwner->writeInt32(0);  // vendor
    mOwner->writeInt8(0);   // decoder version
    mOwner->writeInt8(10);  // level: 10
    mOwner->writeInt8(0);   // profile: 0
    mOwner->endBox();  // d263
}

// This is useful if the pixel is not square
void MPEG4MemoryWriter::Track::writePaspBox() {
    mOwner->beginBox("pasp");
    mOwner->writeInt32(1);  // hspacing
    mOwner->writeInt32(1);  // vspacing
    mOwner->endBox();  // pasp
}

int32_t MPEG4MemoryWriter::Track::getStartTimeOffsetScaledTime() const {
    int64_t trackStartTimeOffsetUs = 0;
    int64_t moovStartTimeUs = mOwner->getStartTimestampUs();
    if (mStartTimestampUs != moovStartTimeUs) {
        CHECK_GT(mStartTimestampUs, moovStartTimeUs);
        trackStartTimeOffsetUs = mStartTimestampUs - moovStartTimeUs;
    }
    return (trackStartTimeOffsetUs *  mTimeScale + 500000LL) / 1000000LL;
}

void MPEG4MemoryWriter::Track::writeSttsBox() {
    mOwner->beginBox("stts");
    mOwner->writeInt32(0);  // version=0, flags=0
    uint32_t duration;
    CHECK(mSttsTableEntries->get(duration, 1));
    duration = htonl(duration);  // Back to host byte order
    mSttsTableEntries->set(htonl(duration + getStartTimeOffsetScaledTime()), 1);
    mSttsTableEntries->write(mOwner);
    mOwner->endBox();  // stts
}

void MPEG4MemoryWriter::Track::writeCttsBox() {
    if (mIsAudio) {  // ctts is not for audio
        return;
    }

    // There is no B frame at all
    if (mMinCttsOffsetTimeUs == mMaxCttsOffsetTimeUs) {
        return;
    }

    // Do not write ctts box when there is no need to have it.
    if (mCttsTableEntries->count() == 0) {
        return;
    }

    ALOGV("ctts box has %d entries with range [%" PRId64 ", %" PRId64 "]",
            mCttsTableEntries->count(), mMinCttsOffsetTimeUs, mMaxCttsOffsetTimeUs);

    mOwner->beginBox("ctts");
    mOwner->writeInt32(0);  // version=0, flags=0
    uint32_t duration;
    CHECK(mCttsTableEntries->get(duration, 1));
    duration = htonl(duration);  // Back host byte order
    mCttsTableEntries->set(htonl(duration + getStartTimeOffsetScaledTime() - mMinCttsOffsetTimeUs), 1);
    mCttsTableEntries->write(mOwner);
    mOwner->endBox();  // ctts
}

void MPEG4MemoryWriter::Track::writeStssBox() {
    mOwner->beginBox("stss");
    mOwner->writeInt32(0);  // version=0, flags=0
    mStssTableEntries->write(mOwner);
    mOwner->endBox();  // stss
}

void MPEG4MemoryWriter::Track::writeStszBox() {
    mOwner->beginBox("stsz");
    mOwner->writeInt32(0);  // version=0, flags=0
    mOwner->writeInt32(0);
    mStszTableEntries->write(mOwner);
    mOwner->endBox();  // stsz
}

void MPEG4MemoryWriter::Track::writeStscBox() {
    mOwner->beginBox("stsc");
    mOwner->writeInt32(0);  // version=0, flags=0
    mStscTableEntries->write(mOwner);
    mOwner->endBox();  // stsc
}

void MPEG4MemoryWriter::Track::writeStcoBox(bool use32BitOffset) {
    mOwner->beginBox(use32BitOffset? "stco": "co64");
    mOwner->writeInt32(0);  // version=0, flags=0
    if (use32BitOffset) {
        mStcoTableEntries->write(mOwner);
    } else {
        mCo64TableEntries->write(mOwner);
    }
    mOwner->endBox();  // stco or co64
}

void MPEG4MemoryWriter::writeUdtaBox() {
    beginBox("udta");
    writeGeoDataBox();
    endBox();
}

/*
 * Geodata is stored according to ISO-6709 standard.
 */
void MPEG4MemoryWriter::writeGeoDataBox() {
    beginBox("\xA9xyz");
    /*
     * For historical reasons, any user data start
     * with "\0xA9", must be followed by its assoicated
     * language code.
     * 0x0012: text string length
     * 0x15c7: lang (locale) code: en
     */
    writeInt32(0x001215c7);
    writeLatitude(mLatitudex10000);
    writeLongitude(mLongitudex10000);
    writeInt8(0x2F);
    endBox();
}

void MPEG4MemoryWriter::write_mem(const void *ptr, size_t size) {
  size_t tail = mBufferPos + size;
  if (mBuffer.size() < tail)
    mBuffer.resize(tail);
  memcpy(mBuffer.editArray() + mBufferPos, ptr, size);
  mBufferPos = tail;
}

}  // namespace android
