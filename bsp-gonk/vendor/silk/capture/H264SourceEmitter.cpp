//#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture-H264SourceEmitter"
#include <log/log.h>

#include <media/stagefright/MediaBuffer.h>
#include <media/stagefright/MetaData.h>
#include "H264SourceEmitter.h"
#include "CaptureDataSocket.h"

using namespace android;

H264SourceEmitter::H264SourceEmitter(
  const sp<MediaSource> &source,
  capture::datasocket::Channel *channel
) : mSource(source),
    mChannel(channel),
    mCodecConfig(nullptr),
    mCodecConfigLength(0)
{
}

H264SourceEmitter::~H264SourceEmitter() {
  delete [] mCodecConfig;
  mCodecConfig = nullptr;
  mCodecConfigLength = 0;
}

status_t H264SourceEmitter::start(MetaData *params) {
  return mSource->start(params);
}

status_t H264SourceEmitter::stop() {
  return mSource->stop();
}

sp<MetaData> H264SourceEmitter::getFormat() {
  return mSource->getFormat();
}

status_t H264SourceEmitter::read(
  MediaBuffer **buffer,
  const ReadOptions *options
) {
  status_t err = mSource->read(buffer, options);

  if (err == 0 && (*buffer) && (*buffer)->range_length()) {
    uint8_t *data = static_cast<uint8_t *>((*buffer)->data()) + (*buffer)->range_offset();
    uint32_t len = (*buffer)->range_length();
    auto metaData = (*buffer)->meta_data();
    if (metaData == nullptr) {
      ALOGE("Failed to get buffer meta_data()");
      return ERROR_MALFORMED;
    }

    int32_t isCodecConfig = 0;
    metaData->findInt32(kKeyIsCodecConfig, &isCodecConfig);

    if (isCodecConfig) {
      // Squirrel away the codec config so it can be prepended to every sync
      // frame
      if (mCodecConfig) {
        delete [] mCodecConfig;
      }
      mCodecConfigLength = len;
      mCodecConfig = new uint8_t[mCodecConfigLength];
      memcpy(mCodecConfig, data, mCodecConfigLength);
    } else {
      if (mChannel != nullptr && mChannel->connected()) {
        int32_t isSyncFrame = 0;
        metaData->findInt32(kKeyIsSyncFrame, &isSyncFrame);

        auto channelDataLength = len;
        if (isSyncFrame) {
          channelDataLength += mCodecConfigLength;
        }

        // TODO: Use memory pool to reduce heap churn?  Need to profile first...
        uint8_t *channelData = reinterpret_cast<uint8_t*>(
          malloc(channelDataLength)
        );
        if (isSyncFrame) {
          if (mCodecConfig != nullptr) {
            memcpy(channelData, mCodecConfig, mCodecConfigLength);
          }
          memcpy(channelData + mCodecConfigLength, data, len);
        } else {
          memcpy(channelData, data, len);
        }
        mChannel->send(
          isSyncFrame ?
            capture::datasocket::TAG_H264_IDR :
            capture::datasocket::TAG_H264,
          channelData,
          channelDataLength,
          free,
          channelData
        );
      }
    }
  }

  return err;
}
