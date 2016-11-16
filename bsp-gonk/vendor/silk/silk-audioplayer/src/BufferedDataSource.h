#ifndef BUFFERED_DATA_SOURCE_H_
#define BUFFERED_DATA_SOURCE_H_

#include <media/stagefright/foundation/ABase.h>
#include <media/stagefright/DataSource.h>
#include <utils/threads.h>
#include <utils/List.h>

namespace android {

struct ABuffer;

struct BufferedDataSource : public DataSource {
    BufferedDataSource();
    ~BufferedDataSource();

    virtual status_t initCheck() const;

    virtual ssize_t readAt(off64_t offset, void *data, size_t size);
    status_t getSize(off64_t *size);

    void queueBuffer(const sp<ABuffer> &buffer);
    void queueEOS(status_t finalResult);
    void reset();
    void doneSniffing();

    size_t countQueuedBuffers();

private:
    Mutex mLock;
    Condition mCondition;
    bool mEraseOnRead;

    off64_t mOffset;
    List<sp<ABuffer> > mBufferQueue;
    status_t mFinalResult;
    off64_t mLength;

    ssize_t readAt_l(off64_t offset, void *data, size_t size);
    status_t deleteUpTo(off64_t offset);
    status_t waitForData(off64_t offset, size_t size);

    DISALLOW_EVIL_CONSTRUCTORS(BufferedDataSource);
};

}  // namespace android

#endif  // BUFFERED_DATA_SOURCE_H_
