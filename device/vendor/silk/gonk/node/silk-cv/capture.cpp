/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>
#include "Matrix.h"
#include <opencv/highgui.h>

/*
 * Implements the 'VideoCapture' Javascript class
 */
class VideoCapture: public Nan::ObjectWrap {
friend class VideoCaptureFrameWorker;
public:
  static void Init(v8::Local<v8::Object> exports);

private:
  explicit VideoCapture(int deviceId, int scaledWidth, int scaledHeight)
    : processing(false),
      scaledWidth(scaledWidth),
      scaledHeight(scaledHeight) {
    cap.open(deviceId);
    if (!cap.isOpened()) {
      processing = true;
      Nan::ThrowError("Camera could not be opened");
    }
  }
  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Read(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Close(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;
  bool processing;
  int scaledWidth;
  int scaledHeight;
  cv::VideoCapture cap;
};


/*
 * Async worker used to process the next frame
 */
class VideoCaptureFrameWorker : public Nan::AsyncWorker {
public:
  explicit VideoCaptureFrameWorker(VideoCapture *videoCapture,
                                   v8::Local<v8::Object> imFull,
                                   v8::Local<v8::Object> imScaled,
                                   Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      videoCapture(videoCapture) {
    videoCapture->processing = true;
    destFull.Reset(imFull);
    destScaled.Reset(imScaled);
  }
  virtual ~VideoCaptureFrameWorker() {}

  void Execute() {
    if (!this->videoCapture->cap.grab()) {
      SetErrorMessage("grab failed");
      return;
    }
    if (!this->videoCapture->cap.retrieve(full, CV_CAP_ANDROID_COLOR_FRAME_RGB)) {
      SetErrorMessage("retrieve failed");
      return;
    }
    cv::resize(
      full,
      scaled,
      cv::Size(videoCapture->scaledWidth, videoCapture->scaledHeight),
      0, 0,
      cv::INTER_LINEAR
    );
  }

  void HandleErrorCallback() {
    videoCapture->processing = false;
    Nan::AsyncWorker::HandleErrorCallback();
  }

  void HandleOKCallback() {
    Nan::HandleScope scope;
    node_opencv::Matrix *mat;

    videoCapture->processing = false;

    v8::Local<v8::Object> localFull = Nan::New(destFull);
    mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(localFull);
    mat->mat = full;

    v8::Local<v8::Object> localScaled = Nan::New(destScaled);
    mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(localScaled);
    mat->mat = scaled;

    destFull.Reset();
    destScaled.Reset();

    v8::Local<v8::Value> argv[] = {
      Nan::Null(),
      localFull,
      localScaled,
    };

    callback->Call(3, argv);
  }

private:
  cv::Mat full;
  cv::Mat scaled;

  Nan::Persistent<v8::Object> destFull;
  Nan::Persistent<v8::Object> destScaled;
  VideoCapture* videoCapture;
};


Nan::Persistent<v8::Function> VideoCapture::constructor;


void VideoCapture::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("VideoCapture").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetPrototypeMethod(tpl, "read", Read);
  Nan::SetPrototypeMethod(tpl, "close", Close);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("VideoCapture").ToLocalChecked(), tpl->GetFunction());
}

NAN_METHOD(VideoCapture::New) {
  if (!info.IsConstructCall()) {
    // Invoked as plain function `VideoCapture(...)`, turn into construct call.
    const int argc = 3;
    v8::Local<v8::Value> argv[argc] = { info[0], info[1], info[2] };
    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance(argc, argv));
    return;
  }

  // Invoked as constructor: `new VideoCapture(deviceId)`

  if (info.Length() < 3 || !info[0]->IsInt32()) {
    Nan::ThrowTypeError("VideoCapture expects three arguments: "
      "deviceId, scaledWidth, scaledHeight");
    return;
  }

  int deviceId = info[0]->ToInt32()->Value();
  int scaledWidth = info[1]->ToInt32()->Value();
  int scaledHeight = info[2]->ToInt32()->Value();

  VideoCapture* self = new VideoCapture(deviceId, scaledWidth, scaledHeight);
  self->Wrap(info.This());
  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(VideoCapture::Read) {
  VideoCapture* self = ObjectWrap::Unwrap<VideoCapture>(info.Holder());

  if (self->processing) {
    Nan::ThrowError("Busy");
    return;
  }

  if (!info[0]->IsObject()) {
    Nan::ThrowTypeError("Argument 1 not a cv::Matrix");
    return;
  }
  if (!info[1]->IsObject()) {
    Nan::ThrowTypeError("Argument 2 not a cv::Matrix");
    return;
  }

  Nan::Callback *callback = new Nan::Callback(info[2].As<v8::Function>());
  Nan::AsyncQueueWorker(
    new VideoCaptureFrameWorker(
      self,
      info[0]->ToObject(),
      info[1]->ToObject(),
      callback
    )
  );
}

NAN_METHOD(VideoCapture::Close) {
  VideoCapture* self = ObjectWrap::Unwrap<VideoCapture>(info.Holder());

  if (self->processing) {
    Nan::ThrowError("Busy");
    return;
  }

  self->processing = true;
}

void Capture_Init(v8::Local<v8::Object> exports) {
  VideoCapture::Init(exports);
}
