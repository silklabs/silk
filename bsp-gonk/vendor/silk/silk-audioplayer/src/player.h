#ifndef PLAYER_H
#define PLAYER_H

#include <nan.h>
#include <string.h>
#include <queue>
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

// Callback struct to copy data from the StreamPayer thread to the v8 event loop
typedef struct {
  std::string event;
  std::string errorMsg;
} EventInfo;

/**
 *
 */
class Player : public Nan::ObjectWrap, public MediaPlayerListener {
public:
  static void Init(v8::Local<v8::Object> exports);
  virtual void notify(int msg, int ext1, int ext2, const Parcel *obj);
  static void async_cb_handler(uv_async_t *handle);

  float gain;
  sp<StreamPlayer> mStreamPlayer;

  // Message passing queue between StreamPlayer callback and v8 async handler
  uv_async_t asyncHandle;
  Mutex eventMutex;
  std::queue<EventInfo *> eventQueue;
  Persistent<Function> eventCallback;
  uv_async_t async;

private:
  explicit Player();
  ~Player();
  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;

  JSFUNC(SetDataSource);
  JSFUNC(Start);
  JSFUNC(Write);
  JSFUNC(SetVolume);
  JSFUNC(Stop);
  JSFUNC(Pause);
  JSFUNC(Resume);
  JSFUNC(GetCurrentPosition);
  JSFUNC(GetDuration);
  JSFUNC(EndOfStream);
  JSFUNC(AddEventListener);

  sp<ALooper> mLooper;
};

#endif
