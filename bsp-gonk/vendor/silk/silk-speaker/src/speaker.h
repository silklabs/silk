#ifndef SPEAKER_H
#define SPEAKER_H

#include <nan.h>
#include <string.h>
#include "audioPlayer.h"

using namespace std;
using namespace v8;
using namespace node;

#define REQ_FUN_ARG(I, VAR) \
  if (info.Length() <= (I) || !info[I]->IsFunction()) { \
    return Nan::ThrowTypeError("Argument " #I " must be a function"); \
  } \
  Local<Function> VAR = Local<Function>::Cast(info[I]);

#define SETUP_FUNCTION(TYP) \
  Nan::HandleScope scope; \
  TYP *self = Nan::ObjectWrap::Unwrap<TYP>(info.Holder());

#define JSFUNC(NAME) \
  static NAN_METHOD(NAME);

#define JSTHROW(ERR) \
  Nan::ThrowError(ERR); \
  return

static const float GAIN_MAX = 1.0;

/*
 * Unwraps Buffer instance "buffer" to a C `char *` with the offset specified.
 */
inline static char * UnwrapPointer(Local<Value> buffer, int64_t offset = 0) {
  if (Buffer::HasInstance(buffer)) {
    return Buffer::Data(buffer.As<Object> ()) + offset;
  } else {
    return NULL;
  }
}

/**
 * This class is a NAN wrapper around AudioPlayer.cpp
 */
class Speaker : public Nan::ObjectWrap {
public:
  static void Init(v8::Local<v8::Object> exports);
  static void playbackPositionUpdateListener(void *userData);

  sp<AudioPlayer> mAudioPlayer;
  float gain;
  Mutex mLock;
  Condition mEOSCondition; // Signal that we reached the end of a stream

private:
  explicit Speaker();
  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;

  JSFUNC(Open);
  JSFUNC(Write);
  JSFUNC(Close);
  JSFUNC(SetVolume);
  JSFUNC(GetFrameSize);
  JSFUNC(SetNotificationMarkerPosition);
  JSFUNC(SetPlaybackPositionUpdateListener);
};

#endif
