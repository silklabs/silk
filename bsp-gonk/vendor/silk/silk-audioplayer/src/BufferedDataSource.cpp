/**
 * This class provides a data source implementation that uses ABuffers to feed
 * data to MediaExtractor and MediaCodec
 */

// #define LOG_NDEBUG 0
#define LOG_TAG "BufferedDataSource"
#include <utils/Log.h>

#include "BufferedDataSource.h"

#include <media/stagefright/foundation/ABuffer.h>
#include <media/stagefright/foundation/ADebug.h>

// Don't wait for data that is larger that these many bytes to avoid having
// to buffer the stream for a long time
const off64_t HIGH_WATERMARK = 10000;
off64_t MAX_OFF_64_T = (off64_t)1 << ((sizeof(off64_t) * 8) - 2);

namespace android {

BufferedDataSource::BufferedDataSource() :
    mEraseOnRead(false),
    mOffset(0),
    mFinalResult(OK),
    mLength(0) {
}

status_t BufferedDataSource::getSize(off64_t *size) {
  Mutex::Autolock autoLock(mLock);

  // Streams have unknown duration so return max value that can
  // be held by off64_t
  *size = MAX_OFF_64_T;
  return OK;
}

status_t BufferedDataSource::initCheck() const {
  return OK;
}

size_t BufferedDataSource::countQueuedBuffers() {
  Mutex::Autolock autoLock(mLock);
  return mBufferQueue.size();
}

void BufferedDataSource::doneSniffing() {
  ALOGD("Done sniffing data");

  // We are done sniffing the data to find the mime type
  // No need to keep the data around that has been read anymore
  mEraseOnRead = true;
}

status_t BufferedDataSource::deleteUpTo(off64_t offset) {
  off64_t newOffset = offset - mOffset;
  ALOGV("new offset %lld", newOffset);

  if (waitForData(0, newOffset) != OK) {
    if (newOffset >= mLength) {
      return ERROR_END_OF_STREAM;
    }
  }

  off64_t offsetInBuffer = newOffset;
  sp<ABuffer> buffer = NULL;
  for (List<sp<ABuffer> >::iterator it = mBufferQueue.begin();
      it != mBufferQueue.end(); it = mBufferQueue.erase(it)) {
    sp<ABuffer> b = *it;
    if (offsetInBuffer < b->size()) {
      buffer = b;
      break;
    } else {
      offsetInBuffer -= b->size();
      mLength -= b->size();
    }
  }

  mLength -= offsetInBuffer;

  if (buffer != NULL) {
    buffer->setRange(buffer->offset() + offsetInBuffer, buffer->size() - offsetInBuffer);
    if (buffer->size() == 0) {
      mBufferQueue.erase(mBufferQueue.begin());
    }
  }

  mOffset = offset;
  return OK;
}

ssize_t BufferedDataSource::readAt(off64_t offset, void *data, size_t size) {
  Mutex::Autolock autoLock(mLock);
  return readAt_l(offset, data, size);
}

ssize_t BufferedDataSource::readAt_l(off64_t offset, void *data, size_t size) {
  ALOGV("***%s ", __FUNCTION__);
  ALOGV("offset %lld", offset);
  ALOGV("size %d", size);
  ALOGV("mLength %lld", mLength);

  if (mEraseOnRead) {
    // Seek the buffer queue to the given offset and delete the rest
    if (deleteUpTo(offset) != OK) {
      ALOGW("deleteUpTo failed due to end of stream");
      return 0;
    }

    // All the data up to the offset has been deleted by the deleteUpTo
    // function, so set the offset to 0
    offset = 0;
  }

  size_t sizeDone = 0;

  while (sizeDone < size) {
    if (waitForData(offset, (size - sizeDone)) != OK) {
      if (offset >= mLength) {
        ALOGW("Returning early %d", sizeDone);
        return sizeDone;
      } else {
        // Try to return as much as we can
        size = mLength - offset;
      }
    }

    size_t copy = size - sizeDone;

    off64_t offsetInBuffer = offset;
    sp<ABuffer> buffer = NULL;
    for (List<sp<ABuffer> >::iterator it = mBufferQueue.begin();
        it != mBufferQueue.end(); ++it) {
      sp<ABuffer> b = *it;
      if (offsetInBuffer < b->size()) {
        buffer = b;
        break;
      } else {
        offsetInBuffer -= b->size();
      }
    }

    if (copy > (buffer->size() - offsetInBuffer)) {
      copy = buffer->size() - offsetInBuffer;
    }

    memcpy((uint8_t *)data + sizeDone, buffer->data() + offsetInBuffer, copy);

    sizeDone += copy;
    offset += copy;
  }

  ALOGV("sizeDone %d", sizeDone);
  return sizeDone;
}

/**
 * Block until size bytes starting at offset are available to read
 */
status_t BufferedDataSource::waitForData(off64_t offset, size_t size) {
  off64_t watermark = (offset + size - mLength);

  while (((mLength - offset) < size) &&
      (mFinalResult != ERROR_END_OF_STREAM) &&
      (watermark < HIGH_WATERMARK)) {
    mCondition.wait(mLock);
  }

  // High watermark reached; return early
  if (watermark >= HIGH_WATERMARK) {
    ALOGV("Reached watermark %lld", watermark);
    return ERROR_OUT_OF_RANGE;
  }

  // Read beyond EOF
  if ((mFinalResult == ERROR_END_OF_STREAM) && (offset >= mLength)) {
    ALOGW("Read beyond EOF total: %lld", mLength);
    return ERROR_END_OF_STREAM;
  }

  return OK;
}

void BufferedDataSource::queueBuffer(const sp<ABuffer> &buffer) {
  Mutex::Autolock autoLock(mLock);

  if (mFinalResult != OK) {
    return;
  }

  mBufferQueue.push_back(buffer);
  mLength += buffer->size();
  mCondition.broadcast();
}

void BufferedDataSource::queueEOS(status_t finalResult) {
  ALOGV("%s %d", __FUNCTION__, finalResult);
  CHECK_NE(finalResult, (status_t)OK);

  Mutex::Autolock autoLock(mLock);

  mFinalResult = finalResult;
  mCondition.broadcast();
}

void BufferedDataSource::reset() {
  Mutex::Autolock autoLock(mLock);

  mFinalResult = OK;
  mBufferQueue.clear();
}

}  // namespace android
