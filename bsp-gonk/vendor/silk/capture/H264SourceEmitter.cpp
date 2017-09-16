//#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture-H264SourceEmitter"
#include <log/log.h>

#include <media/stagefright/MediaBuffer.h>
#include <media/stagefright/MetaData.h>
#include "H264SourceEmitter.h"
#include "CaptureDataSocket.h"

using namespace android;

H264SourceEmitter::H264SourceEmitter(
  const sp<MediaCodecSource> &source,
  capture::datasocket::Channel *channel,
  int preferredBitrate
) : mSource(source),
    mChannel(channel),
    mPreferredBitrate(preferredBitrate),
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
    } else if (mChannel) {
      int32_t isSyncFrame = 0;
      metaData->findInt32(kKeyIsSyncFrame, &isSyncFrame);
      if (mChannel->connected()) {
        auto channelDataLength = len;
        if (isSyncFrame) {
          channelDataLength += mCodecConfigLength;
        }

        // TODO: Use memory pool to reduce heap churn?  Need to profile first...
        uint8_t *channelData = reinterpret_cast<uint8_t*>(
          malloc(channelDataLength)
        );
        if (isSyncFrame) {
          // TODO: Refactor SocketClient::send() to avoid this memcpy()
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
      } else {
        // Hacky!  Through the silk-capture-ctl control socket somebody could
        // change the h264 bitrate at any time (see the "h264SetBitrate" command
        // in Capture.cpp).  This facility is primary intended to lower the
        // bitrate temporarily due to adverse network conditions.  However that
        // same somebody could neglect to restore the bitrate when they
        // disconnect from the capture process (or perhaps they simply crashed).
        //
        // Plus there's no notification when a client connects/disconnects
        // from any capture process socket so there's no nice way to know the
        // bitrate should be restored to the preferred value.
        //
        // As a workaround for all this, the bitrate preferred value is asserted
        // on every sync frame if there no clients are attached to the
        // silk-capture-h264 data socket.  This ensures that eventually the
        // bitrate will return to normal.
        //
        // TODO: This needs to be cleaned up as part of a larger refactoring
        //
        if (isSyncFrame) {
          mSource->videoBitRate(mPreferredBitrate);
        }
      }
    }
  }

  return err;
}
