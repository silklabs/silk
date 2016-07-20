/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#define LOG_TAG "silk-vad-native"
#ifdef ANDROID
#define LOG_NDEBUG 0
#include <utils/Log.h>
#else
#define ALOGV(fmt, args...) fprintf(stderr, LOG_TAG ": " fmt, ##args); fprintf(stderr, "\n");
#define ALOGE ALOGV
#define ALOGD ALOGV
#endif

#include "vad.h"

using namespace std;
using namespace v8;
using namespace node;

#define JSTHROW(ERR) \
  Nan::ThrowError(ERR); \
  return

#define SETUP_FUNCTION(TYP) \
  Nan::HandleScope scope; \
  TYP *self = Nan::ObjectWrap::Unwrap<TYP>(info.Holder());

#define INT_FROM_ARGS(NAME, IND) \
  if (info[IND]->IsInt32()) { \
    NAME = info[IND]->Uint32Value(); \
  }

#define REQ_FUN_ARG(I, VAR) \
  if (info.Length() <= (I) || !info[I]->IsFunction()) { \
    return Nan::ThrowTypeError("Argument " #I " must be a function"); \
  } \
  Local<Function> VAR = Local<Function>::Cast(info[I]);

/*
 * Unwraps Buffer instance "buffer" to a `int16_t *` with the offset specified
 */
inline static const int16_t * UnwrapPointer(Local<Value> buffer, int64_t offset = 0) {
  if (Buffer::HasInstance(buffer)) {
    return reinterpret_cast<const int16_t*>(Buffer::Data(buffer.As<Object> ()) + offset);
  } else {
    return NULL;
  }
}

Nan::Persistent<Function> Vad::constructor;

/**
 *
 */
void Vad::Init(Local<Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  Local<FunctionTemplate> ctor = Nan::New<FunctionTemplate>(New);
  ctor->SetClassName(Nan::New("Vad").ToLocalChecked());
  ctor->InstanceTemplate()->SetInternalFieldCount(1);

  // Prototype
  Nan::SetPrototypeMethod(ctor, "init", Init);
  Nan::SetPrototypeMethod(ctor, "setMode", SetMode);
  Nan::SetPrototypeMethod(ctor, "processAudio", ProcessAudio);

  constructor.Reset(ctor->GetFunction());
  exports->Set(Nan::New("Vad").ToLocalChecked(), ctor->GetFunction());
}

/**
 *
 */
NAN_METHOD(Vad::New) {
  if (info.IsConstructCall()) {
    // Invoked as constructor: `new Vad(...)`
    Vad* obj = new Vad();
    obj->Wrap(info.This());
    info.GetReturnValue().Set(info.This());
  } else {
    // Invoked as plain function `Vad(...)`, turn into construct call.
    Local<Function> cons = Nan::New<Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance());
  }
}

NAN_METHOD(Vad::Init) {
  SETUP_FUNCTION(Vad)

  if (info.Length() < 1) {
    JSTHROW("Invalid number of arguments provided");
  }

  int sampleRate = 16000;
  INT_FROM_ARGS(sampleRate, 0);

  int result = (WebRtcVad_Init(self->vadInst) == 0) &&
      (self->SetSampleRate(sampleRate) == 0);

  info.GetReturnValue().Set(result);
}

NAN_METHOD(Vad::SetMode) {
  SETUP_FUNCTION(Vad)

  if (info.Length() < 1) {
    JSTHROW("Invalid number of arguments provided");
  }

  int mode = 0;
  INT_FROM_ARGS(mode, 0);

  ALOGV("Setting mode to: %d", mode);
  int result = WebRtcVad_set_mode(self->vadInst, mode);
  info.GetReturnValue().Set(result == 0);
}

/**
 * Async worker for voice activity detection
 */
class VADWorker: public Nan::AsyncWorker {
public:
  VADWorker(Nan::Callback* callback, Vad* vad, const int16_t* audioFrame,
            int frameLength) :
    AsyncWorker(callback),
    vad(vad),
    audioFrame(audioFrame),
    frameLength(frameLength),
    result(VAD_EVENT_SILENCE) {
  }

  void Execute() {
    result = vad->ProcessAudio(audioFrame, frameLength / sizeof(int16_t));
  }

  void HandleOKCallback() {
    Local<Value> argv[] = {
      Nan::Null(),
      Nan::New(static_cast<int> (result))
    };
    callback->Call(2, argv);
  }

private:
  Vad* vad;
  const int16_t* audioFrame;
  int frameLength;
  vad_event result;
};

NAN_METHOD(Vad::ProcessAudio) {
  SETUP_FUNCTION(Vad)

  if (info.Length() < 3) {
    JSTHROW("Invalid number of arguments provided");
  }

  const int16_t* audioFrame = UnwrapPointer(info[0]);

  int frameLength = 0;
  INT_FROM_ARGS(frameLength, 1);

  REQ_FUN_ARG(2, cb);
  Nan::Callback *callback = new Nan::Callback(cb.As<Function>());

  Nan::AsyncQueueWorker(new VADWorker(callback, self, audioFrame, frameLength));
}

void InitAll(v8::Local<v8::Object> exports) {
  Vad::Init(exports);
}

NODE_MODULE(vad, InitAll)
