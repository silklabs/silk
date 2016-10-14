#ifndef PLAYER_H
#define PLAYER_H

#include <nan.h>
#include <string.h>
#include <binder/ProcessState.h>
#include <media/mediaplayer.h>

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

static const float GAIN_MAX = 1.0;

/**
 *
 */
class Player : public Nan::ObjectWrap {
public:
  static void Init(v8::Local<v8::Object> exports);
  void Done();
  sp<MediaPlayer> mMediaPlayer;
  float gain;

private:
  explicit Player();
  ~Player();
  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;

  JSFUNC(Play);
  JSFUNC(SetVolume);
  JSFUNC(Stop);
  JSFUNC(Pause);
  JSFUNC(Resume);
  JSFUNC(GetCurrentPosition);
  JSFUNC(GetDuration);
};

#endif
