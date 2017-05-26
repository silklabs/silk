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

#include <media/stagefright/foundation/AHandler.h>
#include <media/stagefright/foundation/AString.h>
#include <utils/KeyedVector.h>

#include "BufferedDataSource.h"

namespace android {

struct ABuffer;
struct ALooper;
struct AudioTrack;
struct MediaCodec;
struct NuMediaExtractor;
class Sniffer;

const uint32_t DATA_SOURCE_TYPE_FILE = 0;
const uint32_t DATA_SOURCE_TYPE_BUFFER = 1;

class StreamPlayerListener: virtual public RefBase {
public:
  virtual void notify(int msg, const char* errorMsg) = 0;
};

class StreamPlayer: public AHandler {
public:
  StreamPlayer();
  ~StreamPlayer();

  status_t setListener(const sp<StreamPlayerListener>& listener);
  int write(const void* bytes, size_t size);
  void setVolume(float volume);
  void setDataSource(uint32_t dataSourceType, const char *path);
  void start();
  void pause();
  void getCurrentPosition(int* msec);
  void getDuration(int64_t* msec);
  void eos();
  void reset();


protected:
  virtual void onMessageReceived(const sp<AMessage> &msg);

private:
  enum State {
    UNPREPARED,
    STOPPED,
    STARTED
  };

  enum {
    kWhatStart = 0,
    kWhatStop = 1,
    kWhatDoMoreStuff = 2,
    kWhatReset = 3,
  };

  struct BufferInfo {
    size_t mIndex;
    size_t mOffset;
    size_t mSize;
    int64_t mPresentationTimeUs;
    uint32_t mFlags;
  };

  struct CodecState {
    sp<MediaCodec> mCodec;
    Vector<sp<ABuffer> > mCSD;
    Vector<sp<ABuffer> > mBuffers[2];

    List<size_t> mAvailInputBufferIndices;
    List<BufferInfo> mAvailOutputBufferInfos;

    sp<AudioTrack> mAudioTrack;
    uint32_t mNumFramesWritten;
    uint64_t mBytesToPlay;
  };

  State mState;
  AString mPath;

  sp<NuMediaExtractor> mExtractor;
  sp<ALooper> mCodecLooper;
  CodecState mCodecState;
  int32_t mDoMoreStuffGeneration;
  sp<BufferedDataSource> mBufferedDataSource;
  uint32_t mDataSourceType;

  sp<StreamPlayerListener> mListener;
  Mutex mNotifyLock;
  int64_t mDurationUs;
  float mGain;
  sp<AMessage> mAudioTrackFormat;

  status_t onPrepare();
  status_t onStart();
  status_t onStop();
  status_t onReset();
  status_t onDoMoreStuff();
  status_t onOutputFormatChanged();

  status_t renderAudio(BufferInfo *info, const sp<ABuffer> &buffer);
  void notify(int msg, const char* errorMsg);
  AMessage* getMessage(uint32_t what);

  DISALLOW_EVIL_CONSTRUCTORS(StreamPlayer);
};

} // namespace android
