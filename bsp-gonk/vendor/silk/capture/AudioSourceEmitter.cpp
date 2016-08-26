//#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture"
#include <utils/Log.h>

#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/MetaData.h>
#include <media/stagefright/AudioSource.h>

#include "AudioSourceEmitter.h"

// AudioSource is always 16 bit PCM (2 bytes / sample)
#define BYTES_PER_SAMPLE 2

// 120ms of audio data per TAG_MIC packet
#define AUDIO_BUFFER_LENGTH_MS 120

using namespace android;

AudioSourceEmitter::AudioSourceEmitter(const sp<MediaSource> &source,
                                       sp<Observer> observer,
                                       int audioSampleRate,
                                       int audioChannels,
                                       bool vadEnabled)
    : mObserver(observer),
      mSource(source),
      mVadEnabled(vadEnabled),
      mAudioBuffer(nullptr),
      mAudioBufferIdx(0),
      mAudioBufferLen((audioSampleRate * BYTES_PER_SAMPLE * audioChannels) *
                      AUDIO_BUFFER_LENGTH_MS / 1000),
      mAudioBufferVad(false)
{
}

AudioSourceEmitter::~AudioSourceEmitter() {
  free(mAudioBuffer);
}

status_t AudioSourceEmitter::start(MetaData *params) {
  return mSource->start(params);
}

status_t AudioSourceEmitter::stop() {
  return mSource->stop();
}

sp<MetaData> AudioSourceEmitter::getFormat() {
  return mSource->getFormat();
}

bool AudioSourceEmitter::vadCheck() {
  if (mVadEnabled) {
    String8 vadState = AudioSystem::getParameters(String8("SourceTrack.vad"));

    if (0 == strncmp(vadState.string(), "SourceTrack.vad=", sizeof("SourceTrack.vad=") - 1)) {
      for (unsigned i = sizeof("SourceTrack.vad=") - 1; i < vadState.length(); i++) {
        if ('1' == vadState.string()[i]) {
          return true; // Voice activity detected
        }
      }
    }
  }
  return false;
}

status_t AudioSourceEmitter::read(MediaBuffer **buffer,
    const ReadOptions *options) {
  status_t err = mSource->read(buffer, options);

  if (err == 0 && (*buffer) && (*buffer)->range_length()) {
    uint8_t *data = static_cast<uint8_t *>((*buffer)->data()) + (*buffer)->range_offset();
    uint32_t len = (*buffer)->range_length();

    mAudioBufferVad |= vadCheck();

    // If these next samples will overrun the buffer then send out data now
    if (mAudioBufferIdx + len > mAudioBufferLen) {
      uint32_t fillLen = mAudioBufferLen - mAudioBufferIdx;
      if (fillLen > 0) {
        // Top off the buffer to ensure that the packet is evenly divisible by
        // the fft window size (mAudioBufferLen)
        memcpy(mAudioBuffer + mAudioBufferIdx, data, fillLen);
        data += fillLen;
        len -= fillLen;
      }

      mObserver->OnData(mAudioBufferVad, mAudioBuffer, mAudioBufferLen);
      mAudioBuffer = nullptr; // Buffer ownership is transferred to OnData()
      mAudioBufferIdx = 0;
      mAudioBufferVad = false;
    }

    // let's assume we will never get a set samples larger than our full buffer
    CHECK(mAudioBufferIdx + len <= mAudioBufferLen);

    // batch samples
    if (mAudioBuffer == nullptr) {
      mAudioBuffer = (uint8_t *) malloc(mAudioBufferLen);
      CHECK(mAudioBuffer != nullptr);
    }
    memcpy(mAudioBuffer + mAudioBufferIdx, data, len);
    mAudioBufferIdx += len;
 }

  return err;
}
