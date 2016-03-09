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

#if CV_MAJOR_VERSION >= 3
#include <opencv2/imgproc.hpp>
#include <opencv2/videoio.hpp>
#endif

#ifdef ANDROID
//#define LOG_NDEBUG 0
#define LOG_TAG "silk-cv:capture"
#include <utils/Log.h>

#include <libpreview.h>
#else
#define ALOGE(fmt, args...) printf(fmt, ##args)
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
  bool closed;
  int scaledWidth;
  int scaledHeight;

  void InternalClose();
#ifdef ANDROID
  libpreview::vtable preview;

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
                                   v8::Local<v8::Object> imRGB,
                                   v8::Local<v8::Object> imGray,
                                   v8::Local<v8::Object> imScaledGray,
                                   Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      videoCapture(videoCapture) {
    videoCapture->processing = true;
    destRGB.Reset(imRGB);
    destGray.Reset(imGray);
    destScaledGray.Reset(imScaledGray);
  }
  virtual ~VideoCaptureFrameWorker() {}

  void Execute() {
#ifdef ANDROID
    if (videoCapture->frameBuffer == NULL) {
      SetErrorMessage("no frame yet");
      return;
    }
    uv_mutex_lock(&videoCapture->frameDataLock);
    switch (videoCapture->frameFormat) {
    default:
      // Porting error.  Nothing to do but soldier on...
      ALOGE("Warning: Unknown frame format: %d\n", videoCapture->frameFormat);
      //fall through
    case libpreview::FRAMEFORMAT_YVU420SP:
      {
        // Setup a Matrix object to store the remote image using the
        // height/width that OpenCV expects for a YVU420 semi-planar format
        cv::Mat remote(
          videoCapture->frameHeight * 3 / 2,
          videoCapture->frameWidth,
          CV_8UC1,
          videoCapture->frameBuffer
        );

        // There is no CY_YVU420sp2RGB, so use CY_YUV420sp2BGR to achieve the same
        //                 ^^      ^ ^             ^^      ^ ^
        cv::cvtColor(remote, rgb, CV_YUV420sp2BGR, 0);

        cv::Mat remoteGray(
          videoCapture->frameHeight,
          videoCapture->frameWidth,
          CV_8UC1,
          videoCapture->frameBuffer
        );
        gray = remoteGray.clone();
        break;
      }
    case libpreview::FRAMEFORMAT_RGB:
      {
        cv::Mat remote(
          videoCapture->frameHeight,
          videoCapture->frameWidth,
          CV_8UC3,
          videoCapture->frameBuffer
        );
        rgb = remote.clone();
        cv::cvtColor(rgb, gray, CV_RGB2GRAY, 0);
        break;
      }
    }
    uv_mutex_unlock(&videoCapture->frameDataLock);
#else
    if (!videoCapture->cap.grab()) {
      SetErrorMessage("grab failed");
      return;
    }
    if (!videoCapture->cap.retrieve(rgb)) {
      SetErrorMessage("retrieve failed");
      return;
    }
    cv::cvtColor(rgb, gray, CV_RGB2GRAY, 0);
#endif

    cv::resize(
      gray,
      scaledGray,
      cv::Size(videoCapture->scaledWidth, videoCapture->scaledHeight),
      0, 0,
      cv::INTER_LINEAR
    );
  }

  void HandleErrorCallback() {
    if (videoCapture->closed) {
      videoCapture->InternalClose();
      return;
    }
    videoCapture->processing = false;

    Nan::AsyncWorker::HandleErrorCallback();
  }

  void HandleOKCallback() {
    Nan::HandleScope scope;
    node_opencv::Matrix *mat;

    if (videoCapture->closed) {
      videoCapture->InternalClose();
      return;
    }
    videoCapture->processing = false;

    v8::Local<v8::Object> localRGB = Nan::New(destRGB);
    mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(localRGB);
    mat->mat = rgb;

    v8::Local<v8::Object> localGray = Nan::New(destGray);
    mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(localGray);
    mat->mat = gray;

    v8::Local<v8::Object> localScaledGray = Nan::New(destScaledGray);
    mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(localScaledGray);
    mat->mat = scaledGray;

    destGray.Reset();
    destScaledGray.Reset();
    destRGB.Reset();

    Nan::AsyncWorker::HandleOKCallback();
  }

private:
  cv::Mat rgb;
  cv::Mat gray;
  cv::Mat scaledGray;

  Nan::Persistent<v8::Object> destRGB;
  Nan::Persistent<v8::Object> destGray;
  Nan::Persistent<v8::Object> destScaledGray;
  VideoCapture* videoCapture;
};


Nan::Persistent<v8::Function> VideoCapture::constructor;

VideoCapture::VideoCapture(int deviceId, int scaledWidth, int scaledHeight)
    : processing(false),
      closed(false),
      scaledWidth(scaledWidth),
      scaledHeight(scaledHeight) {
  bool ok;
#ifdef ANDROID
  uv_mutex_init(&frameDataLock);
  frameWidth = frameHeight = 0;
  frameBuffer = NULL;
  ok = libpreview::load(&preview);
  if (ok) {
    ok = preview.open(OnFrameCallback, this);
  }
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
  InternalClose();
#ifdef ANDROID
  uv_mutex_destroy(&frameDataLock);
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
  if (!info[2]->IsObject()) {
    Nan::ThrowTypeError("Argument 2 not a cv::Matrix");
    return;
  }

  Nan::Callback *callback = new Nan::Callback(info[3].As<v8::Function>());
  Nan::AsyncQueueWorker(
    new VideoCaptureFrameWorker(
      self,
      info[0]->ToObject(),
      info[1]->ToObject(),
      info[2]->ToObject(),
      callback
    )
  );
}

NAN_METHOD(VideoCapture::Close) {
  VideoCapture* self = ObjectWrap::Unwrap<VideoCapture>(info.Holder());

  if (self->closed) {
    return;
  }

  self->closed = true;
  if (!self->processing) {
    self->InternalClose();
    self->processing = true;
  }
}

void VideoCapture::InternalClose() {
#ifdef ANDROID
  uv_mutex_lock(&frameDataLock);
  if (frameBuffer != NULL) {
    preview.releaseFrame(frameBuffer);
    frameBuffer = NULL;
  }
  uv_mutex_unlock(&frameDataLock);
  preview.close();
#else
  cap.release();
#endif
}

#ifdef ANDROID
void VideoCapture::OnFrameCallback(void *userData,
                                   void* buffer,
                                   libpreview::FrameFormat format,
                                   size_t width,
                                   size_t height) {

  VideoCapture *that = static_cast<VideoCapture *>(userData);
  void *lastFrameBuffer = NULL;

  uv_mutex_lock(&that->frameDataLock);
  if (!that->closed) {
    lastFrameBuffer = that->frameBuffer;
    that->frameBuffer = buffer;
    that->frameFormat = format;
    that->frameWidth = width;
    that->frameHeight = height;
    if (lastFrameBuffer) {
      that->preview.releaseFrame(lastFrameBuffer);
    }
  }
  uv_mutex_unlock(&that->frameDataLock);
}
#endif

void Capture_Init(v8::Local<v8::Object> exports) {
  VideoCapture::Init(exports);
}
