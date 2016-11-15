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

class StreamPlayer: public AHandler {
public:
  StreamPlayer();
  ~StreamPlayer();

  int write(const void* bytes, size_t size);
  void setVolume(float volume);
  status_t start();
  status_t stop();
  void getCurrentPosition(int* msec);


protected:
  virtual void onMessageReceived(const sp<AMessage> &msg);

private:
  enum State {
    UNPREPARED,
    STOPPED,
    STARTED
  };

  enum {
    kWhatPrepare = 0,
    kWhatStart = 1,
    kWhatStop = 2,
    kWhatDoMoreStuff = 3,
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
  };

  State mState;

  sp<NuMediaExtractor> mExtractor;
  sp<ALooper> mCodecLooper;
  KeyedVector<size_t, CodecState> mStateByTrackIndex;
  int32_t mDoMoreStuffGeneration;

  int64_t mStartTimeRealUs;

  static status_t PostAndAwaitResponse(const sp<AMessage> &msg,
                                       sp<AMessage> *response);
  status_t onPrepare();
  status_t onStart();
  status_t onStop();
  status_t onReset();
  status_t onDoMoreStuff();
  status_t onOutputFormatChanged(size_t trackIndex, CodecState *state);

  void renderAudio(CodecState *state, BufferInfo *info,
                   const sp<ABuffer> &buffer);

  DISALLOW_EVIL_CONSTRUCTORS(StreamPlayer);
  sp<BufferedDataSource> bufferedDataSource;
};

} // namespace android
