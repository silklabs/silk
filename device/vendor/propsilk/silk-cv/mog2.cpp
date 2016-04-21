/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>
#include <memory>
#include "Matrix.h"
#include <opencv2/video/background_segm.hpp>


struct State {
  cv::Ptr<cv::BackgroundSubtractorMOG2> subtractor;
  bool busy;
  State(cv::Ptr<cv::BackgroundSubtractorMOG2> subtractor)
    : subtractor(subtractor), busy(false) {};
};


/*
 * Implements the 'Mog2' Javascript class
 */
class Mog2: public Nan::ObjectWrap {
friend class Mog2FrameWorker;
public:
  static void Init(v8::Local<v8::Object> exports);

private:
  explicit Mog2(int history, float varThreshold) {
    state.reset(new State(
#if CV_MAJOR_VERSION >= 3
      cv::createBackgroundSubtractorMOG2(history, varThreshold, false)
#else
      new cv::BackgroundSubtractorMOG2(history, varThreshold, false)
#endif
    ));
  }
  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Apply(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void GetBackground(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;
  std::shared_ptr<State> state;
};


/*
 * Async worker used to process the next frame
 */
class Mog2FrameWorker : public Nan::AsyncWorker {
public:
  explicit Mog2FrameWorker(std::weak_ptr<State> weakState,
                           cv::Mat image,
                           v8::Local<v8::Object> outputMat,
                           Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      image(image),
      weakState(weakState) {
    destMat.Reset(outputMat);
  }
  virtual ~Mog2FrameWorker() {}

  void Execute() {
    auto state = weakState.lock();
    if (state) {
#if CV_MAJOR_VERSION >= 3
      state->subtractor->apply(image, fgMask);
#else
      state->subtractor->operator()(image, fgMask);
#endif
    }
  }

  void HandleOKCallback() {
    Nan::HandleScope scope;

    auto state = weakState.lock();
    if (state) {
      state->busy = false;

      v8::Local<v8::Object> localDestMat = Nan::New(destMat);
      node_opencv::Matrix *mat =
        Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(localDestMat);
      mat->mat = fgMask;
      destMat.Reset();

      v8::Local<v8::Value> argv[] = {
        localDestMat,
      };

      callback->Call(1, argv);
    }
  }

private:
  cv::Mat image;
  cv::Mat fgMask;
  Nan::Persistent<v8::Object> destMat;
  std::weak_ptr<State> weakState;
};


Nan::Persistent<v8::Function> Mog2::constructor;


void Mog2::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("Mog2Subtractor").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetPrototypeMethod(tpl, "apply", Apply);
  Nan::SetPrototypeMethod(tpl, "getBackground", GetBackground);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("Mog2Subtractor").ToLocalChecked(), tpl->GetFunction());
}

NAN_METHOD(Mog2::New) {
  if (!info.IsConstructCall()) {
    // Invoked as plain function `Mog2(...)`, turn into construct call.
    const int argc = 2;
    v8::Local<v8::Value> argv[argc] = { info[0], info[1] };
    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance(argc, argv));
    return;
  }

  // Invoked as constructor: `new Mog2(history, varThreshold)`

  if (info.Length() < 2 || !info[0]->IsInt32() || !info[1]->IsNumber() ) {
    Nan::ThrowTypeError("Mog2 expects two arguments: history, varThreshold");
    return;
  }

  int history = info[0]->ToInt32()->Value();
  float varThreshold = info[1]->ToNumber()->Value();

  Mog2* self = new Mog2(history, varThreshold);
  self->Wrap(info.This());
  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(Mog2::Apply) {
  Mog2* self = ObjectWrap::Unwrap<Mog2>(info.Holder());

  if (self->state->busy) {
    Nan::ThrowError("Busy");
    return;
  }

  if (!info[0]->IsObject()) {
    Nan::ThrowTypeError("Argument 1 not a cv::Matrix");
    return;
  }
  cv::Mat frame = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(info[0]->ToObject())->mat;
  if (frame.channels() > 1) {
    Nan::ThrowTypeError("Argument 1 not a grayscale framerix");
    return;
  }
  if (!info[1]->IsObject()) {
    Nan::ThrowTypeError("Argument 2 not a cv::Matrix");
    return;
  }

  self->state->busy = true;
  Nan::Callback *callback = new Nan::Callback(info[2].As<v8::Function>());
  Nan::AsyncQueueWorker(new Mog2FrameWorker(self->state, frame, info[1]->ToObject(), callback));
}

NAN_METHOD(Mog2::GetBackground) {
  Mog2* self = ObjectWrap::Unwrap<Mog2>(info.Holder());

  node_opencv::Matrix *mat =
    Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(info[0]->ToObject());
  self->state->subtractor->getBackgroundImage(mat->mat);
}


void Mog2_Init(v8::Local<v8::Object> exports) {
  Mog2::Init(exports);
}
