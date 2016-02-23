/**
 * Provides a simple video capture class tailored to the needs of camera.js
 *
 * On device libpreview is used as the backend, while on simulator the OpenCV
 * VideoCapture API is used.
 *
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>
#include "Matrix.h"
#include <opencv/highgui.h>
#ifdef ANDROID
#include <libpreview.h>
#endif

/*
 * Implements the 'VideoCapture' Javascript class
 */
class VideoCapture: public Nan::ObjectWrap {
friend class VideoCaptureFrameWorker;
public:
  static void Init(v8::Local<v8::Object> exports);

private:
  explicit VideoCapture(int deviceId, int scaledWidth, int scaledHeight);
  ~VideoCapture();
  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Read(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Close(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;
  bool processing;
  int scaledWidth;
  int scaledHeight;

#ifdef ANDROID
  uv_mutex_t frameDataLock;
  libpreview::FrameFormat frameFormat;
  int frameWidth;
  int frameHeight;
  void *frameBuffer;
  static void OnFrameCallback(void *userData,
                              void* buffer,
                              libpreview::FrameFormat format,
                              size_t width,
                              size_t height);
#else
  cv::VideoCapture cap;
#endif
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
#ifdef ANDROID
    if (videoCapture->frameBuffer == NULL) {
      SetErrorMessage("no frame yet");
      return;
    }
    uv_mutex_lock(&videoCapture->frameDataLock);
    if (videoCapture->frameFormat != libpreview::FRAMEFORMAT_YVU420SP) {
      // Porting error.  Nothing to do but soldier on...
      printf("Warning: Unknown frame format: %d\n", videoCapture->frameFormat);
    }

    cv::Mat remote(
      videoCapture->frameHeight * 3 / 2,
      videoCapture->frameWidth,
      CV_8UC1,
      videoCapture->frameBuffer
    );

    // There is no CY_YVU420sp2RGB, so use CY_YUV420sp2BGR to achieve the same
    //                 ^^      ^ ^             ^^      ^ ^
    cv::cvtColor(remote, full, CV_YUV420sp2BGR, 0);
    uv_mutex_unlock(&videoCapture->frameDataLock);
#else
    if (!videoCapture->cap.grab()) {
      SetErrorMessage("grab failed");
      return;
    }
    if (!videoCapture->cap.retrieve(full, CV_CAP_ANDROID_COLOR_FRAME_RGB)) {
      SetErrorMessage("retrieve failed");
      return;
    }
#endif
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

VideoCapture::VideoCapture(int deviceId, int scaledWidth, int scaledHeight)
    : processing(false),
      scaledWidth(scaledWidth),
      scaledHeight(scaledHeight) {
  bool ok;
#ifdef ANDROID
  uv_mutex_init(&frameDataLock);
  frameWidth = frameHeight = 0;
  frameBuffer = NULL;
  ok = libpreview::open(OnFrameCallback, this);
#else
  cap.open(deviceId);
  ok = cap.isOpened();
#endif
  if (!ok) {
    processing = true;
    Nan::ThrowError("Camera could not be opened");
  }
}

VideoCapture::~VideoCapture() {
#ifdef ANDROID
  uv_mutex_destroy(&frameDataLock);
  libpreview::close();
#endif
}

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


#ifdef ANDROID
void VideoCapture::OnFrameCallback(void *userData,
                                   void* buffer,
                                   libpreview::FrameFormat format,
                                   size_t width,
                                   size_t height) {

  VideoCapture *that = static_cast<VideoCapture *>(userData);
  void *lastFrameBuffer;

  uv_mutex_lock(&that->frameDataLock);
  lastFrameBuffer = that->frameBuffer;
  that->frameBuffer = buffer;
  that->frameFormat = format;
  that->frameWidth = width;
  that->frameHeight = height;
  uv_mutex_unlock(&that->frameDataLock);

  if (lastFrameBuffer) {
    libpreview::releaseFrame(lastFrameBuffer);
  }
}
#endif

void Capture_Init(v8::Local<v8::Object> exports) {
  VideoCapture::Init(exports);
}
