//#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture-segment-writer"
#include <log/log.h>

#include "MPEG4SegmentDASHWriter.h"

#include <arpa/inet.h>
#include <fcntl.h>
#include <inttypes.h>
#include <pthread.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/MediaBuffer.h>
#include <media/stagefright/MetaData.h>
#include <media/stagefright/MediaDefs.h>
#include <media/stagefright/MediaErrors.h>
#include <media/stagefright/MediaSource.h>
#include <media/stagefright/Utils.h>
#include <media/mediarecorder.h>
#include <cutils/properties.h>

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
static const int32_t kInitialDelayTimeMs     = 700;
static const int64_t kExtraAudioDelayTimeUs  = 200000;

typedef MPEG4SegmentDASHWriter::Track Track;

static void stripStartcode(MediaBuffer *buffer) {
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

static void getNalUnitType(uint8_t byte, uint8_t* type) {
    ALOGV("getNalUnitType: %d", byte);

    // nal_unit_type: 5-bit unsigned integer
    *type = (byte & 0x1F);
}

static const uint8_t* findNextStartCode(const uint8_t* data, size_t length) {

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

struct SampleBuffer {
    SampleBuffer(MediaBuffer* buffer, const sp<MetaData>& metadata)
        : metadata(new MetaData(*metadata.get()))
        , size(buffer->range_length())
        , data(malloc(size))
        , scaledDuration()
    {
        memcpy((void*)data, (uint8_t*)buffer->data() + buffer->range_offset(),
               size);
    }

    ~SampleBuffer() {
        free((void*)data);
    }

    sp<MetaData> metadata;
    size_t size;
    void* data;
    int32_t scaledDuration;
};

struct /*STACK_CLASS*/ AutoBox {
    AutoBox(MPEG4SegmentDASHWriter* writer);
    AutoBox(const char* fourcc, AutoBox& parent);
    ~AutoBox();

    void writeCompositionMatrix(int32_t degrees);
    
    void writeInt8(int8_t x);
    void writeInt16(int16_t x);
    void writeInt32(int32_t x);
    void writeInt64(int64_t x);
    void writeCString(const char *s);
    void writeFourcc(const char *fourcc);
    void write(const void *data, size_t size);
    size_t write(const void *ptr, size_t size, size_t nmemb);
    size_t writeAt(int32_t offset, const void *data, size_t size);

    size_t offset() const { return mWriter->mBufferPos; }

private:
    MPEG4SegmentDASHWriter* mWriter;
    const char* mFourcc;
    DISALLOW_EVIL_CONSTRUCTORS(AutoBox);
};

AutoBox::AutoBox(MPEG4SegmentDASHWriter* writer)
    : mWriter(writer)
    , mFourcc()
{ }

AutoBox::AutoBox(const char* fourcc, AutoBox& parent)
    : mWriter(parent.mWriter)
    , mFourcc(fourcc)
{
    mWriter->beginBox(*this, fourcc);
}

AutoBox::~AutoBox() {
    if (mFourcc) {
        mWriter->endBox(*this);
    }
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
void AutoBox::writeCompositionMatrix(int32_t degrees) {
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


void AutoBox::writeInt8(int8_t x) {
    mWriter->write(&x, 1);
}

void AutoBox::writeInt16(int16_t x) {
    x = htons(x);
    mWriter->write(&x, 2);
}

void AutoBox::writeInt32(int32_t x) {
    x = htonl(x);
    mWriter->write(&x, 4);
}

void AutoBox::writeInt64(int64_t x) {
    x = hton64(x);
    mWriter->write(&x, 8);
}

void AutoBox::writeCString(const char *s) {
    size_t n = strlen(s);
    mWriter->write(s, n + 1);
}

void AutoBox::writeFourcc(const char *s) {
    CHECK_EQ(strlen(s), 4);
    mWriter->write(s, 4);
}

void AutoBox::write(const void *data, size_t size) {
    write(data, 1, size);
}

size_t AutoBox::write(const void *ptr, size_t size, size_t nmemb) {
    return mWriter->write(ptr, size, nmemb);
}

size_t AutoBox::writeAt(int32_t offset, const void* data, size_t size) {
    return mWriter->writeAt(offset, data, size);
}

//-----------------------------------------------------------------------------
struct StashedOffsets {
    /**
     * Write the placeholder fields that we'll later fill in with the
     * actual offset values in `update()` below.
     */
    void prepare(AutoBox& box) {
        box.writeInt32(0);      // version = 0, flags = 0
        seqnoOffsetOffset = box.offset();
        box.writeFourcc("????");
        presentationTimeOffsetOffset = box.offset();
        box.writeFourcc("????");
        videoDecodeTimeOffsetOffset = box.offset();
        box.writeFourcc("????");
        audioDecodeTimeOffsetOffset = box.offset();
        box.writeFourcc("????");
    }

    void setSeqnoOffset(AutoBox& box) const {
        update(seqnoOffsetOffset, box);
    }
    void setPresentationTimeOffset(AutoBox& box) const {
        update(presentationTimeOffsetOffset, box);
    }
    void setVideoDecodeTimeOffset(AutoBox& box) const {
        update(videoDecodeTimeOffsetOffset, box);
    }
    void setAudioDecodeTimeOffset(AutoBox& box) const {
        update(audioDecodeTimeOffsetOffset, box);
    }

private:
    /**
     * The offset for `offsetOffset`, one of the fields stored in this
     * struct, has become known --- it will be the next value written
     * by `box`.  So write the now-known offset value into its
     * placeholder position.
     */
    void update(int32_t offsetOffset, AutoBox& box) const {
        int32_t offset = htonl(box.offset());
        box.writeAt(offsetOffset, &offset, sizeof(offset));
    }

    // These fields are "offset offsets" --- the offsets within our
    // index at which we'll store the value of the offsets of
    // interesting items.
    int32_t seqnoOffsetOffset;
    int32_t presentationTimeOffsetOffset;
    int32_t videoDecodeTimeOffsetOffset;
    int32_t audioDecodeTimeOffsetOffset;
};


static void writeFtypBox(AutoBox& parent) {
    AutoBox box("ftyp", parent);
    box.writeFourcc("isom");
    box.writeInt32(512);
    box.writeFourcc("isom");
    box.writeFourcc("iso2");
    box.writeFourcc("avc1");
    box.writeFourcc("mp41");
}

static void writeFreeBox(AutoBox& parent) {
    AutoBox box("free", parent);
}

static void writeMvhdBox(AutoBox& parent,
                         int64_t durationUs, int32_t timeScale,
                         int32_t numTracks) {
    AutoBox box("mvhd", parent);
    box.writeInt32(0);             // version=0, flags=0
    box.writeInt32(0);             // creation time
    box.writeInt32(0);             // modification time
    box.writeInt32(timeScale);     // mvhd timescale
    // The 5e5 / 1e6 calculation is intended to round the duration to
    // a tick interval without accumulating errors.  The author
    // (cjones) propagates this calculation without having validated
    // its accuracy.  (Carried errors are not much of a problem for us
    // with short-ish segment durations anyway.)
    int32_t duration = (durationUs * timeScale + 5e5) / 1e6;
    box.writeInt32(duration);
    box.writeInt32(0x10000);       // rate: 1.0
    box.writeInt16(0x100);         // volume
    box.writeInt16(0);             // reserved
    box.writeInt32(0);             // reserved
    box.writeInt32(0);             // reserved
    box.writeCompositionMatrix(0); // matrix
    box.writeInt32(0);             // predefined
    box.writeInt32(0);             // predefined
    box.writeInt32(0);             // predefined
    box.writeInt32(0);             // predefined
    box.writeInt32(0);             // predefined
    box.writeInt32(0);             // predefined
    box.writeInt32(numTracks + 1);  // nextTrackID
}

static void writeZeroEntryBox(const char* fourcc, AutoBox& parent,
                              int extraZeros = 0) {
    AutoBox box(fourcc, parent);
    box.writeInt32(0);          // version = 0, flags = 0
    box.writeInt32(0);          // entry count
    for (int i = 0; i < extraZeros; ++i) {
        box.writeInt32(0);
    }
}

//-----------------------------------------------------------------------------
class MPEG4SegmentDASHWriter::Track {
public:
    Track(MPEG4SegmentDASHWriter *owner, const sp<MediaSource> &source, size_t trackId);

    ~Track();

    status_t start(MetaData *params);
    status_t stop();
    status_t pause();
    bool reachedEOS();

    int64_t getDurationUs() const;
    int32_t getTimeScale() const { return mTimeScale; }
    int32_t getScaledDuration() const;
    bool isAvc() const { return mIsAvc; }
    bool isAudio() const { return mIsAudio; }
    bool isMPEG4() const { return mIsMPEG4; }
    int32_t getTrackId() const { return mTrackId; }
    const char* name() const { return mIsAudio ? "Audio" : "Video"; }

    void writeTrexBox(AutoBox& parent);
    void writeTrepBox(AutoBox& parent);
    void writeTrafBox(AutoBox& parent, const StashedOffsets& offsets,
                      bool use4ByteNalLength);
    void writeTrakBox(AutoBox& parent);
    void writeMdat(AutoBox& parent, int32_t moofOffset,
                   bool use4ByteNalLength = true);
    
private:
    // Sequence parameter set or picture parameter set
    struct AVCParamSet {
        AVCParamSet(uint16_t length, const uint8_t *data)
            : mLength(length), mData(data) {}

        uint16_t mLength;
        const uint8_t *mData;
    };

    MPEG4SegmentDASHWriter* mOwner;
    List<SampleBuffer*> mSamples;
    sp<MetaData> mMeta;
    sp<MediaSource> mSource;
    List<AVCParamSet> mSeqParamSets;
    List<AVCParamSet> mPicParamSets;
    pthread_t mThread;
    int64_t mTrackDurationUs;
    int64_t mStartTimestampUs;
    int64_t mPreviousTrackTimeUs;
    int64_t mTrackEveryTimeDurationUs;
    void* mCodecSpecificData;
    size_t mCodecSpecificDataSize;
    int32_t mTimeScale;
    int32_t mTrackId;
    int32_t mRotation;
    int32_t mDatOffsetOffset;
    int32_t mTrackDurationTicks;
    volatile bool mDone;
    volatile bool mPaused;
    volatile bool mResumed;
    volatile bool mStarted;
    bool mIsAvc;
    bool mIsAudio;
    bool mIsMPEG4;   
    bool mGotAllCodecSpecificData;
    bool mTrackingProgressStatus;
    bool mReachedEOS;
    uint8_t mProfileIdc;
    uint8_t mProfileCompatible;
    uint8_t mLevelIdc;

    static void *ThreadWrapper(void* me);
    status_t threadEntry();

    int32_t getStartTimeOffsetScaledTime() const;

    const uint8_t *parseParamSet(
        const uint8_t *data, size_t length, int type, size_t *paramSetLen);

    status_t makeAVCCodecSpecificData(const uint8_t* data, size_t size);
    status_t copyAVCCodecSpecificData(const uint8_t* data, size_t size);
    status_t parseAVCCodecSpecificData(const uint8_t* data, size_t size);

    // Track authoring progress status
    void trackProgressStatus(int64_t timeUs, status_t err = OK);
    void initTrackingProgressStatus(MetaData* params);

    void getCodecSpecificDataFromInputFormatIfPossible();

    // Determine the track time scale
    // If it is an audio track, try to use the sampling rate as
    // the time scale; however, if user chooses the overwrite
    // value, the user-supplied time scale will be used.
    void setTimeScale();

    // Simple validation on the codec specific data
    status_t checkCodecSpecificData() const;

    void writeMdiaBox(AutoBox& parent);
    void writeMinfBox(AutoBox& parent);
    void writeStblBox(AutoBox& parent);
    void writeAudioFourCCBox(AutoBox& parent);
    void writeVideoFourCCBox(AutoBox& parent);
    void writeDamrBox(AutoBox& parent);
    void writeAvccBox(AutoBox& parent);
    void writeD263Box(AutoBox& parent);
    void writeMp4aEsdsBox(AutoBox& parent);
    void writeMp4vEsdsBox(AutoBox& parent);

    DISALLOW_EVIL_CONSTRUCTORS(Track);
};

Track::Track(MPEG4SegmentDASHWriter* owner,
             const sp<MediaSource>& source, size_t trackId)
    : mOwner(owner)
    , mMeta(source->getFormat())
    , mSource(source)
    , mTrackDurationUs()
    , mStartTimestampUs()
    , mPreviousTrackTimeUs()
    , mTrackEveryTimeDurationUs()
    , mCodecSpecificData()
    , mCodecSpecificDataSize()
    , mTimeScale()
    , mTrackId(trackId)
    , mRotation(0)
    , mDatOffsetOffset()
    , mTrackDurationTicks()
    , mDone(false)
    , mPaused(false)
    , mResumed(false)
    , mStarted(false)
    , mIsAvc()
    , mIsAudio()
    , mIsMPEG4()
    , mGotAllCodecSpecificData()
    , mReachedEOS()
    , mProfileIdc()
    , mProfileCompatible()
    , mLevelIdc()
{
    getCodecSpecificDataFromInputFormatIfPossible();

    const char *mime;
    mMeta->findCString(kKeyMIMEType, &mime);
    mIsAvc = !strcasecmp(mime, MEDIA_MIMETYPE_VIDEO_AVC);
    mIsAudio = !strncasecmp(mime, "audio/", 6);
    mIsMPEG4 = !strcasecmp(mime, MEDIA_MIMETYPE_VIDEO_MPEG4) ||
               !strcasecmp(mime, MEDIA_MIMETYPE_AUDIO_AAC);

    setTimeScale();
}

Track::~Track() {
    stop();

    typedef List<SampleBuffer*>::iterator It;
    for (It it = mSamples.begin(); it != mSamples.end(); ++it) {
        SampleBuffer* buf = *it;
        delete buf;
    }
    mSamples.clear();
    
    if (mCodecSpecificData != NULL) {
        free(mCodecSpecificData);
        mCodecSpecificData = NULL;
    }
}

status_t Track::start(MetaData *params) {
    if (!mDone && mPaused) {
        mPaused = false;
        mResumed = true;
        return OK;
    }

    int64_t startTimeUs;
    if (params == NULL || !params->findInt64(kKeyTime, &startTimeUs)) {
        startTimeUs = 0;
    }

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
         */
        int64_t startTimeOffsetUs = mOwner->getStartTimeOffsetMs() * 1000LL;
        if (mIsAudio) {
            // XXX Audio needs an extra bump for some reason.
            startTimeOffsetUs += kExtraAudioDelayTimeUs;
        }

        ALOGD(
          "Start %s time offset: %" PRId64 " us",
          mIsAudio ? "audio" : "video",
          startTimeOffsetUs
        );
        startTimeUs += startTimeOffsetUs;
    }

    meta->setInt64(kKeyTime, startTimeUs);

    status_t err = mSource->start(meta.get());
    if (err != OK) {
        mDone = mReachedEOS = true;
        mOwner->signalEOS();
        return err;
    }

    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_JOINABLE);

    mDone = false;
    mStarted = true;
    mTrackDurationUs = 0;
    mTrackDurationTicks = 0;
    mReachedEOS = false;

    pthread_create(&mThread, &attr, ThreadWrapper, this);
    pthread_attr_destroy(&attr);

    return OK;
}

status_t Track::stop() {
    ALOGV("%s track stopping", mIsAudio? "Audio": "Video");
    if (!mStarted) {
        ALOGE("Stop() called but track is not started");
        return ERROR_END_OF_STREAM;
    }

    if (mDone) {
        return OK;
    }
    mDone = true;

    ALOGV("%s track source stopping", mIsAudio? "Audio": "Video");
    mSource->stop();
    ALOGV("%s track source stopped", mIsAudio? "Audio": "Video");

    void *dummy;
    pthread_join(mThread, &dummy);
    status_t err = static_cast<status_t>(reinterpret_cast<uintptr_t>(dummy));

    ALOGV("%s track stopped", mIsAudio? "Audio": "Video");
    return err;
}

status_t Track::pause() {
    mPaused = true;
    return OK;
}

bool Track::reachedEOS() {
    return mReachedEOS;
}

int64_t Track::getDurationUs() const {
    return mTrackDurationUs;
}

int32_t Track::getScaledDuration() const {
    return mTrackDurationTicks;
}

void Track::writeTrexBox(AutoBox& parent) {
    AutoBox box("trex", parent);
    box.writeInt32(0);          // version = 0, flags = 0
    box.writeInt32(mTrackId);
    box.writeInt32(1);          // sample description index(?)
    box.writeInt32((*mSamples.begin())->scaledDuration);
    // Sample size is variable.
    box.writeInt32(0);          // sample size
    int32_t sampleFlags = mIsAudio ? 0x0 : 0x10000;
    box.writeInt32(sampleFlags);
}

void Track::writeTrepBox(AutoBox& parent) {
    AutoBox box("trep", parent);
    box.writeInt32(0);          // version = 0, flags = 0
    box.writeInt32(mTrackId);
}

void Track::writeTrafBox(AutoBox& parent, const StashedOffsets& offsets,
                         bool use4ByteNalLength) {
    AutoBox traf("traf", parent);
    {
        AutoBox tfhd("tfhd", traf);
        // Version and flags.
        tfhd.writeInt32((0x00 << 24) | // version 0
                        0x00000020   | // "default flags present"
                        0x00020000);   // "default base is moof"

        // Track id.
        tfhd.writeInt32(mTrackId);

        // Default sample flags.
        if (mIsAudio) {
            tfhd.writeInt32(0x02000000); // "sample depends no"
        } else {
            tfhd.writeInt32(0x00010000 | // "sample is non-sync"
                            0x01000000); // "sample depends yes"
        }
    }
    {
        AutoBox tfdt("tfdt", traf);
        tfdt.writeInt32(0);     // version = 0, flags = 0
        // This decode offset is relative to the start of the "key
        // track" (video).  When the segment is played back, an
        // additional decode offset will be added to this to account
        // for all previously-played segments.
        if (mIsAudio) {
            offsets.setAudioDecodeTimeOffset(tfdt);
        } else {
            offsets.setVideoDecodeTimeOffset(tfdt);
        }
        tfdt.writeInt32(getStartTimeOffsetScaledTime());
    }
    {
        AutoBox trun("trun", traf);

        int flags =
            0x00000001 | // "data offset present"
            0x00000100 | // "sample duration present"
            0x00000200;  // "sample size present"
        if (!mIsAudio) {
            flags |= 0x00000004; // "first sample flags"
        }

        // Version and flags.
        trun.writeInt32((0x00 << 24) | // version 0
                        flags);

        // Sample count.
        trun.writeInt32(mSamples.size());

        // We'll fill in the mdat offset we're ready to write our
        // mdat.
        mDatOffsetOffset = trun.offset();

        // Data offset.
        trun.writeFourcc("?off");

        // First sample flags.
        if (flags & 0x00000004) {
            trun.writeInt32(0x02000000); // "sample depends no"
        }

        typedef List<SampleBuffer*>::iterator It;
        for (It it = mSamples.begin(); it != mSamples.end(); ++it) {
            const SampleBuffer* buf = *it;

            // Sample duration.
            trun.writeInt32(buf->scaledDuration);

            // Sample size.
            size_t extraBytes = isAvc() ? (use4ByteNalLength ? 4 : 2) : 0;
            trun.writeInt32(buf->size + extraBytes);
        }
    }
}

void Track::writeTrakBox(AutoBox& parent) {
    AutoBox trak("trak", parent);
    {
        AutoBox tkhd("tkhd", trak);
        tkhd.writeInt32(0x3);   // version = 0, flags = 0x3
        tkhd.writeInt32(0);     // creation time
        tkhd.writeInt32(0);     // modification time
        tkhd.writeInt32(mTrackId);
        tkhd.writeInt32(0);     // reserved
        tkhd.writeInt32(0);     // duration
        tkhd.writeInt32(0);     // reserved
        tkhd.writeInt32(0);     // reserved
        tkhd.writeInt16(0);     // layer
        tkhd.writeInt16(0);     // alternate group
        tkhd.writeInt16(mIsAudio ? 0x100 : 0); // volume
        tkhd.writeInt16(0);                    // reserved
        tkhd.writeCompositionMatrix(mRotation);
        if (mIsAudio) {
            tkhd.writeInt32(0);
            tkhd.writeInt32(0);
        } else {
            int32_t width, height;
            bool success = mMeta->findInt32(kKeyWidth, &width);
            success = success && mMeta->findInt32(kKeyHeight, &height);
            CHECK(success);

            tkhd.writeInt32(width << 16);   // 32-bit fixed-point value
            tkhd.writeInt32(height << 16);  // 32-bit fixed-point value
        }
    }
    {
        AutoBox edts("edts", trak);
        {
            AutoBox elst("elst", edts);
            elst.writeInt32(0); // version = 0, flags = 0
            elst.writeInt32(1); // entry size
            elst.writeInt32(0); // segment duration
            elst.writeInt32(0); // media time
            elst.writeInt16(1); // media rate integer
            elst.writeInt16(0); // media rate fraction
        }
    }
    writeMdiaBox(trak);
}

void Track::writeMdat(AutoBox& parent, int32_t moofOffset,
                      bool use4ByteNalLength) {
    int32_t mdatOffset = htonl(parent.offset() - moofOffset);
    parent.writeAt(mDatOffsetOffset, &mdatOffset, sizeof(mdatOffset));

    typedef List<SampleBuffer*>::iterator It;
    for (It it = mSamples.begin(); it != mSamples.end(); ++it) {
        const SampleBuffer* buf = *it;
        if (isAvc() && use4ByteNalLength) {
            uint8_t x = buf->size >> 24;
            parent.write(&x, 1);
            x = (buf->size >> 16) & 0xff;
            parent.write(&x, 1);
            x = (buf->size >> 8) & 0xff;
            parent.write(&x, 1);
            x = buf->size & 0xff;
            parent.write(&x, 1);
        } else if (isAvc()) {
            CHECK_LT(buf->size, 65536);

            uint8_t x = buf->size >> 8;
            parent.write(&x, 1);
            x = buf->size & 0xff;
            parent.write(&x, 1);
        }
        parent.write(buf->data, buf->size);
    }
}

/*static*/ void* Track::ThreadWrapper(void* me) {
    Track *track = static_cast<Track *>(me);

    status_t err = track->threadEntry();
    return (void *)(uintptr_t)err;
}

status_t Track::threadEntry() {
    int32_t count = 0;
    int32_t nZeroLengthFrames = 0;
    int64_t lastTimestampUs = 0;      // Previous sample time stamp
    int64_t lastDurationUs = 0;       // Between the previous two samples
    int64_t currDurationTicks = 0;    // Timescale based ticks
    int64_t lastDurationTicks = 0;    // Timescale based ticks
    uint32_t previousSampleSize = 0;  // Size of the previous sample
    int64_t previousPausedDurationUs = 0;
    int64_t timestampUs = 0;

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
    SampleBuffer* lastSample = nullptr;

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

            if (mIsAvc) {
                status_t err = makeAVCCodecSpecificData(
                        (const uint8_t *)buffer->data()
                            + buffer->range_offset(),
                        buffer->range_length());
                CHECK_EQ((status_t)OK, err);
            } else if (mIsMPEG4) {
                mCodecSpecificDataSize = buffer->range_length();
                if (mCodecSpecificData) {
                  free(mCodecSpecificData);
                }
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

        if (mIsAvc) stripStartcode(copy);

        size_t sampleSize = copy->range_length();
        if (mIsAvc) {
            if (mOwner->useNalLengthFour()) {
                sampleSize += 4;
            } else {
                sampleSize += 2;
            }
        }

        int32_t isSync = false;
        meta_data->findInt32(kKeyIsSyncFrame, &isSync);
        CHECK(meta_data->findInt64(kKeyTime, &timestampUs));

////////////////////////////////////////////////////////////////////////////////
        if (mSamples.size() == 0) {
            mStartTimestampUs = timestampUs;
            mOwner->setStartTimestampUs(mStartTimestampUs);
            previousPausedDurationUs = mStartTimestampUs;
        }

        if (mResumed) {
            int64_t durExcludingEarlierPausesUs = timestampUs - previousPausedDurationUs;
            if (WARN_UNLESS(durExcludingEarlierPausesUs >= 0ll, "for %s track", name())) {
                copy->release();
                return ERROR_MALFORMED;
            }

            int64_t pausedDurationUs = durExcludingEarlierPausesUs - mTrackDurationUs;
            if (WARN_UNLESS(pausedDurationUs >= lastDurationUs, "for %s track", name())) {
                copy->release();
                return ERROR_MALFORMED;
            }

            previousPausedDurationUs += pausedDurationUs - lastDurationUs;
            mResumed = false;
        }

        timestampUs -= previousPausedDurationUs;
        if (WARN_UNLESS(timestampUs >= 0ll, "for %s track", name())) {
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
            timestampUs = decodingTimeUs;
            ALOGV("decoding time: %" PRId64, timestampUs);
        }

        if (WARN_UNLESS(timestampUs >= 0ll, "for %s track", name())) {
            copy->release();
            return ERROR_MALFORMED;
        }

        ALOGV("%s media time stamp: %" PRId64 " and previous paused duration %" PRId64,
                name(), timestampUs, previousPausedDurationUs);
        if (timestampUs > mTrackDurationUs) {
            mTrackDurationUs = timestampUs;
            mTrackDurationTicks = (timestampUs * mTimeScale + 5E5) / 1E6;
        }

        // We need to use the time scale based ticks, rather than the
        // timestamp itself to determine whether we have to use a new
        // stts entry, since we may have rounding errors.
        // The calculation is intended to reduce the accumulated
        // rounding errors.
        currDurationTicks =
            ((timestampUs * mTimeScale + 5E5) / 1E6 -
                (lastTimestampUs * mTimeScale + 5E5) / 1E6);
        if (currDurationTicks < 0) {
            ALOGE("timestampUs %" PRId64 " < lastTimestampUs %" PRId64 " for %s track",
                timestampUs, lastTimestampUs, name());
            copy->release();
            return UNKNOWN_ERROR;
        }

#if !LOG_NDEBUG
        {
          double unscaledDuration =
              (timestampUs - lastTimestampUs) * mTimeScale / 1E6;
          ALOGV("%s scaled duration %f to %" PRId64,
                name(),
                unscaledDuration,
                currDurationTicks);
        }
#endif

        if (lastSample) {
            lastSample->scaledDuration = currDurationTicks;
        }
        mSamples.push_back(lastSample = new SampleBuffer(copy, meta_data));
        copy->release();

        ALOGV("%s timestampUs/lastTimestampUs: %" PRId64 "/%" PRId64,
                name(), timestampUs, lastTimestampUs);
        lastDurationUs = timestampUs - lastTimestampUs;
        lastDurationTicks = currDurationTicks;
        lastTimestampUs = timestampUs;

        if (isSync != 0) {
            //addOneStssTableEntry(mStszTableEntries->count());
        }

        if (mTrackingProgressStatus) {
            if (mPreviousTrackTimeUs <= 0) {
                mPreviousTrackTimeUs = mStartTimestampUs;
            }
            trackProgressStatus(timestampUs);
        }
    }

    mOwner->trackProgressStatus(mTrackId, -1, err);

    // We don't really know how long the last frame lasts, since
    // there is no frame time after it, just repeat the previous
    // frame's duration.
    if (mSamples.size() == 1) {
        lastDurationUs = 0;  // A single sample's duration
        lastDurationTicks = 0;
    }

    if (lastSample) {
        lastSample->scaledDuration = currDurationTicks;
    }
    
    mTrackDurationUs += lastDurationUs;
    mTrackDurationTicks += lastDurationTicks;
    mReachedEOS = true;
    mOwner->signalEOS();

    ALOGV("Received total/0-length (%d/%d) buffers and encoded %d frames. - %s",
          count, nZeroLengthFrames, mSamples.size(), name());

    if (err == ERROR_END_OF_STREAM) {
        return OK;
    }
    return err;
}

int32_t Track::getStartTimeOffsetScaledTime() const {
    int64_t trackStartTimeOffsetUs = 0;
    int64_t moovStartTimeUs = mOwner->getStartTimestampUs();
    if (mStartTimestampUs != moovStartTimeUs) {
        CHECK_GT(mStartTimestampUs, moovStartTimeUs);
        trackStartTimeOffsetUs = mStartTimestampUs - moovStartTimeUs;
    }
    return (trackStartTimeOffsetUs *  mTimeScale + 500000LL) / 1000000LL;
}

const uint8_t *Track::parseParamSet(
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

status_t Track::copyAVCCodecSpecificData(const uint8_t *data, size_t size) {
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

status_t Track::parseAVCCodecSpecificData(const uint8_t *data, size_t size) {

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
    return OK;
}

void Track::trackProgressStatus(int64_t timeUs, status_t err) {
    ALOGV("trackProgressStatus: %" PRId64 " us", timeUs);

    if (mTrackEveryTimeDurationUs > 0 &&
        timeUs - mPreviousTrackTimeUs >= mTrackEveryTimeDurationUs) {
        ALOGV("Fire time tracking progress status at %" PRId64 " us", timeUs);
        mOwner->trackProgressStatus(mTrackId, timeUs - mPreviousTrackTimeUs, err);
        mPreviousTrackTimeUs = timeUs;
    }
}

void Track::initTrackingProgressStatus(MetaData *params) {
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

void Track::getCodecSpecificDataFromInputFormatIfPossible() {
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

void Track::setTimeScale() {
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

status_t Track::checkCodecSpecificData() const {
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

void Track::writeMdiaBox(AutoBox& parent) {
    AutoBox mdia("mdia", parent);
    {
        AutoBox box("mdhd", mdia);
        box.writeInt32(0);             // version=0, flags=0
        box.writeInt32(0);             // creation time
        box.writeInt32(0);             // modification time
        box.writeInt32(mTimeScale);    // media timescale
        box.writeInt32(0);             // media duration
        // Language follows the three letter standard ISO-639-2/T
        // 'e', 'n', 'g' for "English", for instance.
        // Each character is packed as the difference between its ASCII value and 0x60.
        // For "English", these are 00101, 01110, 00111.
        // XXX: Where is the padding bit located: 0x15C7?
        //box.writeInt16(0x15c7);        // language code
        box.writeInt16(0x55c4);
        box.writeInt16(0);             // predefined
    }
    {
        AutoBox box("hdlr", mdia);
        box.writeInt32(0);             // version=0, flags=0
        box.writeInt32(0);             // component type: should be mhlr
        box.writeFourcc(mIsAudio ? "soun" : "vide");  // component subtype
        box.writeInt32(0);             // reserved
        box.writeInt32(0);             // reserved
        box.writeInt32(0);             // reserved
        box.writeCString(mIsAudio ? "SoundHandler": "VideoHandler"); // name
    }
    writeMinfBox(mdia);
}

void Track::writeMinfBox(AutoBox& parent) {
    AutoBox minf("minf", parent);
    if (mIsAudio) {
        AutoBox smhd("smhd", minf);
        smhd.writeInt32(0);     // version=0, flags=0
        smhd.writeInt16(0);     // balance
        smhd.writeInt16(0);     // reserved
    } else {
        AutoBox vmhd("vmhd", minf);
        vmhd.writeInt32(0x01);  // version=0, flags=1
        vmhd.writeInt16(0);     // graphics mode
        vmhd.writeInt16(0);     // opcolor
        vmhd.writeInt16(0);
        vmhd.writeInt16(0);
    }
    {
        AutoBox dinf("dinf", minf);
        {
            AutoBox dref("dref", dinf);
            dref.writeInt32(0);  // version = 0, flags = 0
            dref.writeInt32(1);  // entry count (either url or urn)
            {
                AutoBox box("url ", dref);
                box.writeInt32(1);  // version = 0, flags = 1 (self-contained)
            }
        }
    }
    writeStblBox(minf);
}

void Track::writeStblBox(AutoBox& parent) {
    AutoBox stbl("stbl", parent);
    {
        AutoBox stsd("stsd", stbl);
        stsd.writeInt32(0);     // version = 0, flags = 0
        stsd.writeInt32(1);     // entry count
        if (mIsAudio) {
            writeAudioFourCCBox(stsd);
        } else {
            writeVideoFourCCBox(stsd);
        }
    }
    // This is just the mp4 header --- the real samples are in the
    // fragment.
    writeZeroEntryBox("stts", stbl);
    writeZeroEntryBox("stsc", stbl);
    writeZeroEntryBox("stsz", stbl, 1/*extra zero*/);
    writeZeroEntryBox("stco", stbl);
}

void Track::writeAudioFourCCBox(AutoBox& parent) {
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

    AutoBox box(fourcc, parent);  // audio format
    box.writeInt32(0);     // reserved
    box.writeInt16(0);     // reserved
    box.writeInt16(0x1);   // data ref index
    box.writeInt32(0);     // reserved
    box.writeInt32(0);     // reserved
    int32_t nChannels;
    CHECK_EQ(true, mMeta->findInt32(kKeyChannelCount, &nChannels));
    box.writeInt16(nChannels);   // channel count
    box.writeInt16(16);          // sample size
    box.writeInt16(0);           // predefined
    box.writeInt16(0);           // reserved

    int32_t samplerate;
    success = mMeta->findInt32(kKeySampleRate, &samplerate);
    CHECK(success);
    box.writeInt32(samplerate << 16);
    if (!strcasecmp(MEDIA_MIMETYPE_AUDIO_AAC, mime)) {
        writeMp4aEsdsBox(box);
    } else if (!strcasecmp(MEDIA_MIMETYPE_AUDIO_AMR_NB, mime) ||
               !strcasecmp(MEDIA_MIMETYPE_AUDIO_AMR_WB, mime)) {
        writeDamrBox(box);
    }
}

void Track::writeVideoFourCCBox(AutoBox& parent) {
    const char *mime;
    bool success = mMeta->findCString(kKeyMIMEType, &mime);
    CHECK(success);
    const char* fourcc = NULL;
    if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_MPEG4, mime)) {
        fourcc = "mp4v";
    } else if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_H263, mime)) {
        fourcc = "s263";
    } else if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_AVC, mime)) {
        fourcc = "avc1";
    } else {
        ALOGE("Unknown mime type '%s'.", mime);
        CHECK(!"should not be here, unknown mime type.");
    }

    AutoBox box(fourcc, parent); // video format
    box.writeInt32(0);           // reserved
    box.writeInt16(0);           // reserved
    box.writeInt16(1);           // data ref index
    box.writeInt16(0);           // predefined
    box.writeInt16(0);           // reserved
    box.writeInt32(0);           // predefined
    box.writeInt32(0);           // predefined
    box.writeInt32(0);           // predefined

    int32_t width, height;
    success = mMeta->findInt32(kKeyWidth, &width);
    success = success && mMeta->findInt32(kKeyHeight, &height);
    CHECK(success);

    box.writeInt16(width);
    box.writeInt16(height);
    box.writeInt32(0x480000);    // horiz resolution
    box.writeInt32(0x480000);    // vert resolution
    box.writeInt32(0);           // reserved
    box.writeInt16(1);           // frame count
    box.writeInt8(0);            // compressor string length
    box.write("                               ", 31);
    box.writeInt16(0x18);        // depth
    box.writeInt16(-1);          // predefined

    CHECK_LT(23 + mCodecSpecificDataSize, 128);

    if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_MPEG4, mime)) {
        writeMp4vEsdsBox(box);
    } else if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_H263, mime)) {
        writeD263Box(box);
    } else if (!strcasecmp(MEDIA_MIMETYPE_VIDEO_AVC, mime)) {
        writeAvccBox(box);
    }

//    writePaspBox(box);
}

void Track::writeDamrBox(AutoBox& parent) {
    // 3gpp2 Spec AMRSampleEntry fields
    AutoBox box("damr", parent);
    box.writeCString("   ");  // vendor: 4 bytes
    box.writeInt8(0);         // decoder version
    box.writeInt16(0x83FF);   // mode set: all enabled
    box.writeInt8(0);         // mode change period
    box.writeInt8(1);         // frames per sample
}

void Track::writeAvccBox(AutoBox& parent) {
    CHECK(mCodecSpecificData);
    CHECK_GE(mCodecSpecificDataSize, 5);

    // Patch avcc's lengthSize field to match the number
    // of bytes we use to indicate the size of a nal unit.
    uint8_t *ptr = (uint8_t *)mCodecSpecificData;
    ptr[4] = (ptr[4] & 0xfc) | (mOwner->useNalLengthFour() ? 3 : 1);
    AutoBox box("avcC", parent);
    box.write(mCodecSpecificData, mCodecSpecificDataSize);
}

void Track::writeD263Box(AutoBox& parent) {
    AutoBox box("d263", parent);
    box.writeInt32(0);  // vendor
    box.writeInt8(0);   // decoder version
    box.writeInt8(10);  // level: 10
    box.writeInt8(0);   // profile: 0
}

void Track::writeMp4aEsdsBox(AutoBox& parent) {
    AutoBox box("esds", parent);
    CHECK(mCodecSpecificData);
    CHECK_GT(mCodecSpecificDataSize, 0);

    // Make sure all sizes encode to a single byte.
    CHECK_LT(mCodecSpecificDataSize + 23, 128);

    box.writeInt32(0);     // version=0, flags=0
    box.writeInt8(0x03);   // ES_DescrTag
    box.writeInt8(23 + mCodecSpecificDataSize);
    box.writeInt16(0x0000);// ES_ID
    box.writeInt8(0x00);

    box.writeInt8(0x04);   // DecoderConfigDescrTag
    box.writeInt8(15 + mCodecSpecificDataSize);
    box.writeInt8(0x40);   // objectTypeIndication ISO/IEC 14492-2
    box.writeInt8(0x15);   // streamType AudioStream

    box.writeInt16(0x03);  // XXX
    box.writeInt8(0x00);   // buffer size 24-bit
    box.writeInt32(96000); // max bit rate
    box.writeInt32(96000); // avg bit rate

    box.writeInt8(0x05);   // DecoderSpecificInfoTag
    box.writeInt8(mCodecSpecificDataSize);
    box.write(mCodecSpecificData, mCodecSpecificDataSize);

    static const uint8_t kData2[] = {
        0x06,  // SLConfigDescriptorTag
        0x01,
        0x02
    };
    box.write(kData2, sizeof(kData2));
}

void Track::writeMp4vEsdsBox(AutoBox& parent) {
    CHECK(mCodecSpecificData);
    CHECK_GT(mCodecSpecificDataSize, 0);
    AutoBox box("esds", parent);

    box.writeInt32(0);    // version=0, flags=0

    box.writeInt8(0x03);  // ES_DescrTag
    box.writeInt8(23 + mCodecSpecificDataSize);
    box.writeInt16(0x0000);  // ES_ID
    box.writeInt8(0x1f);

    box.writeInt8(0x04);  // DecoderConfigDescrTag
    box.writeInt8(15 + mCodecSpecificDataSize);
    box.writeInt8(0x20);  // objectTypeIndication ISO/IEC 14492-2
    box.writeInt8(0x11);  // streamType VisualStream

    static const uint8_t kData[] = {
        0x01, 0x77, 0x00,
        0x00, 0x03, 0xe8, 0x00,
        0x00, 0x03, 0xe8, 0x00
    };
    box.write(kData, sizeof(kData));

    box.writeInt8(0x05);  // DecoderSpecificInfoTag

    box.writeInt8(mCodecSpecificDataSize);
    box.write(mCodecSpecificData, mCodecSpecificDataSize);

    static const uint8_t kData2[] = {
        0x06,  // SLConfigDescriptorTag
        0x01,
        0x02
    };
    box.write(kData2, sizeof(kData2));
}

//-----------------------------------------------------------------------------
MPEG4SegmentDASHWriter::MPEG4SegmentDASHWriter()
    : mVideoTrack(nullptr)
    , mAudioTrack(nullptr)
    , mMuteAudio(false)
    , mBufferPos(0)
    , mMdatOffset(0)
    , mStartTimestampUs(0)
    , mTimeScale(0)
    , mStartTimeOffsetMs(kInitialDelayTimeMs)
    , mInitCheck(NO_INIT)
    , mUse4ByteNalLength(true)
    , mPaused(false)
    , mStarted(false)
    , mIsRealTimeRecording(true)
    , mDone(false)
{
    mInitCheck = OK;
}

MPEG4SegmentDASHWriter::~MPEG4SegmentDASHWriter() {
    reset();
    delete mVideoTrack;
    delete mAudioTrack;
}

status_t MPEG4SegmentDASHWriter::init(const sp<MediaSource>& video,
                                      const sp<MediaSource>* audio,
                                      bool muteAudio) {
    Mutex::Autolock lock(mLock);
    if (mStarted) {
        ALOGE("Attempt to add source AFTER recording is started");
        return UNKNOWN_ERROR;
    }
    if (mVideoTrack || mAudioTrack) {
        ALOGE("init() can only be called once");
        return UNKNOWN_ERROR;
    }
    
    CHECK(video.get());
    CHECK(!audio || audio->get());

    int32_t trackId = 1;
    Track* videoTrack = new Track(this, video, trackId++);
    if (videoTrack->isAudio() || !videoTrack->isAvc()) {
        ALOGE("Expected video track to be AVC video");
        return ERROR_UNSUPPORTED;
    }
    mVideoTrack = videoTrack;
    mMuteAudio = muteAudio;
    if (audio) {
        Track* audioTrack = new Track(this, *audio, trackId++);
        if (!audioTrack->isAudio()) {
            ALOGE("Expected audio track to be audio");
            return ERROR_UNSUPPORTED;
        }
        mAudioTrack = audioTrack;
    }
    return OK;
    
}

status_t MPEG4SegmentDASHWriter::start(MetaData *param) {
    if (mInitCheck != OK) {
        return UNKNOWN_ERROR;
    }

    int32_t use2ByteNalLength;
    if (param &&
        param->findInt32(kKey2ByteNalLength, &use2ByteNalLength) &&
        use2ByteNalLength) {
        mUse4ByteNalLength = false;
    }

    int32_t isRealTimeRecording;
    if (param &&
        param->findInt32(kKeyRealTimeRecording, &isRealTimeRecording)) {
        mIsRealTimeRecording = !!isRealTimeRecording;
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

    status_t err = startTracks(param);
    if (err != OK) {
        return err;
    }

    mStarted = true;
    return OK;
}

status_t MPEG4SegmentDASHWriter::pause() {
    if (mInitCheck != OK) {
        return OK;
    }
    mPaused = true;
    status_t err = OK;
    status_t status = mVideoTrack->pause();
    if (status != OK) {
        err = status;
    }
    if (mAudioTrack) {
        status = mAudioTrack->pause();
        if (status != OK) {
            err = status;
        }
    }
    return err;
}

status_t Track::makeAVCCodecSpecificData(const uint8_t *data, size_t size) {

    if (mCodecSpecificData != NULL) {
        ALOGE("Already have codec specific data");
        return ERROR_MALFORMED;
    }

    if (size < 4) {
        ALOGE("Codec specific data length too short: %zu", size);
        return ERROR_MALFORMED;
    }

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

bool MPEG4SegmentDASHWriter::reachedEOS() {
    return (mVideoTrack->reachedEOS()
            && (!mAudioTrack || mAudioTrack->reachedEOS()));
}

void MPEG4SegmentDASHWriter::setStartTimeOffsetMs(int ms) {
    ALOGI("setStartTimeOffsetMs(%d)", ms);
    mStartTimeOffsetMs = ms;
}

int64_t MPEG4SegmentDASHWriter::getKeyTrackDurationUs() const {
    return mVideoTrack->getDurationUs();
}

void MPEG4SegmentDASHWriter::waitForEOS() {
    Mutex::Autolock autoLock(mLock);
    while (!reachedEOS()) {
        mEOSCondition.wait(mLock);
    }
}

void MPEG4SegmentDASHWriter::setStartTimestampUs(int64_t timeUs) {
    ALOGV("setStartTimestampUs: %" PRId64, timeUs);
    CHECK_GE(timeUs, 0ll);
    Mutex::Autolock autoLock(mLock);
    if (mStartTimestampUs < 0 || mStartTimestampUs > timeUs) {
        mStartTimestampUs = timeUs;
        ALOGV("Earliest track starting time: %" PRId64, mStartTimestampUs);
    }
}

int64_t MPEG4SegmentDASHWriter::getStartTimestampUs() {
    Mutex::Autolock autoLock(mLock);
    return mStartTimestampUs;
}

status_t MPEG4SegmentDASHWriter::startTracks(MetaData* params) {
    if (!mVideoTrack) {
        ALOGE("No source added");
        return INVALID_OPERATION;
    }

    status_t err = mVideoTrack->start(params);
    if (err != OK) {
        return err;
    }
    if (mAudioTrack) {
        mAudioTrack->start(params);
        if (err != OK) {
            return err;
        }
    }
    return OK;
}

void MPEG4SegmentDASHWriter::signalEOS() {
  Mutex::Autolock autoLock(mLock);
  mEOSCondition.signal();
}

size_t MPEG4SegmentDASHWriter::numTracks() {
    Mutex::Autolock lock(mLock);
    return 1 + !!mAudioTrack;
}

bool MPEG4SegmentDASHWriter::useNalLengthFour() const {
    return mUse4ByteNalLength;
}

void MPEG4SegmentDASHWriter::trackProgressStatus(
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

status_t MPEG4SegmentDASHWriter::reset() {
    if (mInitCheck != OK) {
        return OK;
    } else {
        if (!mStarted) {
            release();
            return OK;
        }
    }

    status_t err = OK;
    status_t status = mVideoTrack->stop();
    if (status != OK) {
        err = status;
    }
    ALOGV("Video track duration: %" PRId64 "us", mVideoTrack->getDurationUs());
    if (mAudioTrack) {
        status = mAudioTrack->stop();
        if (err == OK && status != OK) {
            err = status;
        }
        ALOGV("Audio track duration: %" PRId64 "us", mAudioTrack->getDurationUs());
    }

    // Do not write out movie header on error.
    if (err != OK) {
        release();
        return err;
    }

    writeSegment();
    
    CHECK(mBoxes.empty());

    release();
    return err;
}

void MPEG4SegmentDASHWriter::release() {
    mInitCheck = NO_INIT;
    mStarted = false;
}

static void writeStypBox(AutoBox& parent) {
    AutoBox box("styp", parent);
    box.writeFourcc("msdh");    // major brand
    box.writeInt32(0);          // minor version
    box.writeFourcc("msdh");    // compatible brands:
    box.writeFourcc("msix");
}

static void writeSidxBox(AutoBox& parent, const StashedOffsets& offsets,
                         Track* keyTrack, int32_t* referencedSizeOffset) {
    AutoBox box("sidx", parent);
    box.writeInt32(0);          // version
    box.writeInt32(1);          // reference ID
    box.writeInt32(keyTrack->getTimeScale());
    // We don't know what our earliest presentation will be when
    // played back, so we leave this "blank".
    offsets.setPresentationTimeOffset(box);
    box.writeFourcc("?prs");    // earliest presentation time
    box.writeInt32(0);          // first offset
    box.writeInt16(0);          // reserved
    box.writeInt16(1);          // reference count
    
    // We'll fill in the referenced size when've finished fleshing out
    // the segment.
    *referencedSizeOffset = box.offset();
    box.writeFourcc("?siz");
    box.writeInt32(keyTrack->getScaledDuration());
    box.writeInt32(0);          // no SAP
}

void MPEG4SegmentDASHWriter::writeSegment() {
    AutoBox box(this);          // top-level pseudo-box
    writeHeader(box);

    int32_t segmentStartOffset = box.offset();
    writeStypBox(box);
    // Leave behind an index of the offsets that need to be rewritten
    // at playback time on the client side.  We'll fill in the offsets
    // as we discover them when writing the rest of the segment.
    // Because the index is stored in a "free" box, playback widgets
    // will ignore it.
    StashedOffsets offsets;
    {
        AutoBox udta("free", box);
        {
            AutoBox xmta("Xmta", udta);
            offsets.prepare(xmta);

            // Store mute property so player can mute away the silent frames
            // to remove any potential speaker noise.
            xmta.writeInt32(mMuteAudio ? 1 : 0);
        }
    }
    int32_t referencedSizeOffset;
    // Key the fragment duration off of the video track.
    writeSidxBox(box, offsets, mVideoTrack, &referencedSizeOffset);
    int32_t moofOffset = writeMoofBox(box, offsets);
    writeMdat(box, moofOffset);

    int32_t segmentSize = htonl(mBufferPos - segmentStartOffset);
    box.writeAt(referencedSizeOffset, &segmentSize, sizeof(segmentSize));
}

void MPEG4SegmentDASHWriter::writeHeader(AutoBox& parent) {
    {
        AutoBox box("ftyp", parent);
        box.writeFourcc("iso5");
        box.writeInt32(1);
        box.writeFourcc("avc1");
        box.writeFourcc("iso5");
        box.writeFourcc("dash");
    }
    writeFreeBox(parent);
    writeMoovBox(parent);
}

void MPEG4SegmentDASHWriter::writeMoovBox(AutoBox& parent) {
    AutoBox moov("moov", parent);
    // The timescale here doesn't matter, any value works.
    int32_t dummyTimeScale = 1000;
    // See note above about where the magic 5e5/1e6 values come from.
    int32_t scaledDuration =
        (mVideoTrack->getDurationUs() * dummyTimeScale + 5e5) / 1e6;
    {
        AutoBox mvhd("mvhd", moov);
        mvhd.writeInt32(0);     // version = 0, flags = 0
        mvhd.writeInt32(0);     // creation time
        mvhd.writeInt32(0);     // modification time
        mvhd.writeInt32(1000);  // mvhd timescale
        // Segments provide duration information.
        mvhd.writeInt32(0);             // duration
        mvhd.writeInt32(0x10000);       // rate: 1.0
        mvhd.writeInt16(0x100);         // volume
        mvhd.writeInt16(0);             // reserved
        mvhd.writeInt32(0);             // reserved
        mvhd.writeInt32(0);             // reserved
        mvhd.writeCompositionMatrix(0); // matrix
        mvhd.writeInt32(0);             // predefined
        mvhd.writeInt32(0);             // predefined
        mvhd.writeInt32(0);             // predefined
        mvhd.writeInt32(0);             // predefined
        mvhd.writeInt32(0);             // predefined
        mvhd.writeInt32(0);             // predefined
        int32_t numTracks = 1 + (mAudioTrack ? 1 : 0);
        mvhd.writeInt32(numTracks + 1); // nextTrackID
    }
    {
        AutoBox mvex("mvex", moov);
        {
            AutoBox mehd("mehd", mvex);
            mehd.writeInt32(0);              // version = 0, flags = 0
            mehd.writeInt32(scaledDuration); // fragment duration
        }
        mVideoTrack->writeTrexBox(moov);
        if (mAudioTrack) {
            mAudioTrack->writeTrexBox(moov);
        }
        mVideoTrack->writeTrepBox(moov);
        if (mAudioTrack) {
            mAudioTrack->writeTrepBox(moov);
        }
    }
    mVideoTrack->writeTrakBox(moov);
    if (mAudioTrack) {
        mAudioTrack->writeTrakBox(moov);
    }
}

int32_t MPEG4SegmentDASHWriter::writeMoofBox(AutoBox& parent,
                                             const StashedOffsets& offsets) {
    int32_t moofOffset = parent.offset();
    AutoBox moof("moof", parent);
    {
        AutoBox mfhd("mfhd", moof);
        mfhd.writeInt32(0);     // version = 0, flags = 0
        // We don't know what the sequence number will be when played
        // back, so we leave this "blank".
        offsets.setSeqnoOffset(mfhd);
        mfhd.writeFourcc("?seq");
    }
    mVideoTrack->writeTrafBox(moof, offsets, mUse4ByteNalLength);
    if (mAudioTrack) {
        mAudioTrack->writeTrafBox(moof, offsets, mUse4ByteNalLength);
    }
    return moofOffset;
}

void MPEG4SegmentDASHWriter::writeMdat(AutoBox& parent, int32_t moofOffset) {
    int32_t mdatOffset = parent.offset();
    parent.write("?ln?mdat", 8);
    mVideoTrack->writeMdat(parent, moofOffset, mUse4ByteNalLength);
    if (mAudioTrack) {
        mAudioTrack->writeMdat(parent, moofOffset);
    }
    int32_t mdatSize = htonl(parent.offset() - mdatOffset);
    parent.writeAt(mdatOffset, &mdatSize, sizeof(mdatSize));
}

void MPEG4SegmentDASHWriter::beginBox(AutoBox& box, const char *fourcc) {
    CHECK_EQ(strlen(fourcc), 4);

    mBoxes.push_back(mBufferPos);

    box.writeInt32(0);
    box.writeFourcc(fourcc);
}

void MPEG4SegmentDASHWriter::endBox(AutoBox& box) {
    (void) box;
    CHECK(!mBoxes.empty());

    // Get the most recently saved box offset and then erase it.
    // mBoxes.end() returns an iterator, which is what we're
    // manipulating here.
    off64_t boxStartOffset = *--mBoxes.end();
    mBoxes.erase(--mBoxes.end());

    int32_t boxSize = htonl(mBufferPos - boxStartOffset);
    raw_write_mem(boxStartOffset, &boxSize, sizeof(boxSize));
}

size_t MPEG4SegmentDASHWriter::write(const void *ptr, size_t size) {
    return write(ptr, 1, size);
}

size_t MPEG4SegmentDASHWriter::write(
    const void *ptr, size_t size, size_t nmemb) {
    size_t bytes = size * nmemb;
    mBufferPos += raw_write_mem(mBufferPos, ptr, bytes);
    return bytes;
}

size_t MPEG4SegmentDASHWriter::writeAt(
    int32_t offset, const void* ptr, size_t size) {
    return raw_write_mem(offset, ptr, size);
}

size_t MPEG4SegmentDASHWriter::raw_write_mem(
    int32_t bufferPos, const void* ptr, size_t size) {
    size_t tail = bufferPos + size;
    if (mBuffer.size() < tail) {
        mBuffer.resize(tail);
    }
    memcpy(mBuffer.editArray() + bufferPos, ptr, size);
    return size;
}

#ifdef TARGET_GE_NOUGAT
status_t MPEG4SegmentDASHWriter::addSource(const sp<IMediaSource>&)
#else
status_t MPEG4SegmentDASHWriter::addSource(const sp<MediaSource>&)
#endif
{
    return ERROR_UNSUPPORTED;
}

}  // namespace android
