#ifndef PLAYER_H
#define PLAYER_H

#include <nan.h>
#include <string.h>
#include <binder/ProcessState.h>
#include <media/mediaplayer.h>
#include "StreamPlayer.h"

using namespace android;
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

#define INT_FROM_ARGS(NAME, IND) \
  if (info[IND]->IsInt32()) { \
    NAME = info[IND]->Uint32Value(); \
  } else { \
    Nan::ThrowTypeError("Invalid argument type"); \
  }

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

static const float GAIN_MAX = 1.0;

typedef enum _AudioType {
  AUDIO_TYPE_FILE = 0,
  AUDIO_TYPE_STREAM = 1
} AudioType;

/**
 *
 */
class Player : public Nan::ObjectWrap {
public:
  static void Init(v8::Local<v8::Object> exports);
  void Done();
  sp<MediaPlayer> mMediaPlayer;
  float gain;
  sp<StreamPlayer> mStreamPlayer;

private:
  explicit Player(AudioType audioType);
  ~Player();
  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;

  JSFUNC(Play);
  JSFUNC(Prepare);
  JSFUNC(Write);
  JSFUNC(SetVolume);
  JSFUNC(Stop);
  JSFUNC(Pause);
  JSFUNC(Resume);
  JSFUNC(GetCurrentPosition);
  JSFUNC(GetDuration);

  sp<ALooper> mLooper;
};

#endif
