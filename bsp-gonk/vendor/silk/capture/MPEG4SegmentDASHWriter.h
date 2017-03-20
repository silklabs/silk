#ifndef MPEG4_SEGMENT_DASH_WRITER_H_
#define MPEG4_SEGMENT_DASH_WRITER_H_

#include <stdio.h>

#include <media/stagefright/foundation/ABase.h>
#include <media/stagefright/MediaWriter.h>
#include <utils/List.h>
#include <utils/threads.h>

namespace android {

class MediaBuffer;
struct MediaSource;
class MetaData;

struct AutoBox;
struct StashedOffsets;

class MPEG4SegmentDASHWriter : public MediaWriter {
public:
    class Track;

    MPEG4SegmentDASHWriter();

    status_t init(const sp<MediaSource>& video,
                  const sp<MediaSource>* audio = nullptr,
                  bool muteAudio = false);
    
    // Returns INVALID_OPERATION if there is no source or track.
    virtual status_t start(MetaData* param = nullptr);
    virtual status_t stop() { return reset(); }
    virtual status_t pause();
    virtual bool reachedEOS();
    virtual void setStartTimeOffsetMs(int ms);
    virtual int32_t getStartTimeOffsetMs() const { return mStartTimeOffsetMs; }

    int32_t getTimeScale() const { return mTimeScale; }
    int64_t getKeyTrackDurationUs() const;

    const Vector<char> data() { return mBuffer; }

    void waitForEOS();

protected:
    virtual ~MPEG4SegmentDASHWriter();

private:
    Mutex mLock;
    Condition mEOSCondition; // Signal that we reached the end of a stream
    pthread_t mThread;       // Thread id for the writer
    List<off64_t> mBoxes;
    Vector<char> mBuffer;    
    Track* mVideoTrack;
    Track* mAudioTrack;
    bool mMuteAudio;
    off_t mBufferPos;
    off_t mMdatOffset;
    int64_t mStartTimestampUs;
    int32_t mTimeScale;
    int32_t mStartTimeOffsetMs;
    status_t mInitCheck;
    bool mUse4ByteNalLength;    
    bool mSelfContainedMp4;
    bool mPaused;
    bool mStarted;  // Track threads started successfully
    bool mIsRealTimeRecording;
    volatile bool   mDone;                  // Writer thread is done?

    void setStartTimestampUs(int64_t timeUs);
    int64_t getStartTimestampUs();  // Not const
    status_t startTracks(MetaData *params);

    void signalEOS();

    size_t numTracks();
    // Return whether the nal length is 4 bytes or 2 bytes
    // Only makes sense for H.264/AVC
    bool useNalLengthFour() const;

    // Return whether the writer is used for real time recording.
    // By default, real time recording is on.
    bool isRealTimeRecording() const { return mIsRealTimeRecording; }

    void trackProgressStatus(size_t trackId, int64_t timeUs, status_t err = OK);
    status_t reset();
    void release();

    void writeSegment();
    void writeHeader(AutoBox& parent);
    void writeMoovBox(AutoBox& parent);
    int32_t writeMoofBox(AutoBox& parent, const StashedOffsets& offsets);
    void writeMdat(AutoBox& parent, int32_t moofOffset);

    friend struct AutoBox;
    void beginBox(AutoBox& box, const char *fourcc);
    void endBox(AutoBox& box);

    inline size_t write(const void* ptr, size_t size);
    inline size_t write(const void* ptr, size_t size, size_t nmemb);
    size_t writeAt(int32_t offset, const void* ptr, size_t size);

    size_t raw_write_mem(int32_t bufferPos, const void* ptr, size_t size);

    // Disabled.  Use init() instead.
    virtual status_t addSource(const sp<MediaSource>&);
    DISALLOW_EVIL_CONSTRUCTORS(MPEG4SegmentDASHWriter);
};

}  // namespace android

#endif  // MPEG4_SEGMENT_DASH_WRITER_H_
