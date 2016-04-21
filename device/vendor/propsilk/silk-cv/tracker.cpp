/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>
#include <opencv2/opencv.hpp>
#if CV_MAJOR_VERSION >= 3
#include <opencv2/imgproc.hpp>
#else
#include <opencv/highgui.h>
#endif
#include "Matrix.h"
#include "TrackerBase.h"
#include "trackerCMT.hpp"
#include "trackerDlib.hpp"
#include <memory>

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-cv:tracker"
#ifdef ANDROID
#include <utils/Log.h>
#else
#ifdef LOG_NDEBUG
#define ALOGD(LOG_TAG fmt, args...) printf(fmt, ##args)
#else
#define ALOGD(fmt, args...)
#endif
#endif


struct TrackerState {
  TrackerBase *tracker;
  bool busy;
  TrackerState(TrackerBase *tracker)
    : tracker(tracker), busy(false) {};
  ~TrackerState() {
    ALOGD("TrackerState::Dtor %p", this);
    delete tracker;
  }
};

/*
 * Implements the 'Tracker' Javascript class
 */
class NodeTracker: public Nan::ObjectWrap {
friend class TrackerInitWorker;
friend class TrackerUpdateWorker;
public:
  static void Init(v8::Local<v8::Object> exports);

private:
  explicit NodeTracker(TrackerBase *tracker, int frameWidth, int frameHeight)
    : state(new TrackerState(tracker)),
      frameWidth(frameWidth),
      frameHeight(frameHeight) {
  }
  ~NodeTracker() {}

  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Update(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Busy(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Cancel(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;
  std::shared_ptr<TrackerState> state;
  int frameWidth;
  int frameHeight;
};


/*
 * Async worker used to initialize a NodeTracker object
 */
class TrackerInitWorker : public Nan::AsyncWorker {
public:
  explicit TrackerInitWorker(std::weak_ptr<TrackerState> weakState, cv::Mat mat, cv::Rect rect, Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      mat(mat),
      rect(rect),
      weakState(weakState) {}
  virtual ~TrackerInitWorker() {}

  void Execute() {
    bool success = false;
    try {
      auto state = weakState.lock();
      if (state) {
        success = state->tracker->init(mat, rect);
      }
    } catch (const std::exception &e) {
      SetErrorMessage(e.what());
      return;
    }
    if (!success) {
      SetErrorMessage("Tracker initialization failed");
      return;
    }
  }

  void HandleOKCallback () {
    Nan::HandleScope scope;

    auto state = weakState.lock();
    if (state) {
      state->busy = false;

      v8::Local<v8::Value> argv[] = {
        Nan::Null(),
      };
      callback->Call(1, argv);
    }
  }

private:
  cv::Mat mat;
  cv::Rect rect;
  std::weak_ptr<TrackerState> weakState;
};


/*
 * Async worker used to process the next frame for a Tracker object
 */
class TrackerUpdateWorker : public Nan::AsyncWorker {
public:
  explicit TrackerUpdateWorker(std::weak_ptr<TrackerState> weakState, cv::Mat mat, Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      mat(mat),
      found(false),
      confidence(0),
      weakState(weakState) {
    rect.x = rect.y = rect.width = rect.height = -1;
  }
  virtual ~TrackerUpdateWorker() {}

  void Execute() {
    try {
      auto state = weakState.lock();
      if (state) {
        found = state->tracker->update(mat, rect, &confidence);
      }
    } catch (const std::exception &e) {
      SetErrorMessage(e.what());
    }
  }

  void HandleErrorCallback() {
    auto state = weakState.lock();
    if (state) {
      state->busy = false;
      Nan::AsyncWorker::HandleErrorCallback();
    }
  }

  void HandleOKCallback() {
    Nan::HandleScope scope;

    auto state = weakState.lock();
    if (state) {
      state->busy = false;

      v8::Local<v8::Object> rectObject = Nan::New<v8::Object>();
      rectObject->Set(Nan::New<v8::String>("x").ToLocalChecked(),
                      Nan::New<v8::Number>(rect.x));
      rectObject->Set(Nan::New<v8::String>("y").ToLocalChecked(),
                      Nan::New<v8::Number>(rect.y));
      rectObject->Set (Nan::New<v8::String>("width").ToLocalChecked(),
                      Nan::New<v8::Number>(rect.width));
      rectObject->Set(Nan::New<v8::String>("height").ToLocalChecked(),
                      Nan::New<v8::Number>(rect.height));

      v8::Local<v8::Value> argv[] = {
        Nan::Null(),
        Nan::New<v8::Boolean>(found),
        rectObject,
        Nan::New<v8::Number>(confidence),
      };
      callback->Call(4, argv);
    }
  }

private:
  cv::Mat mat;
  cv::Rect rect;
  bool found;
  double confidence;
  std::weak_ptr<TrackerState> weakState;
};

Nan::Persistent<v8::Function> NodeTracker::constructor;

void NodeTracker::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("Tracker").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetPrototypeMethod(tpl, "update", Update);
  Nan::SetPrototypeMethod(tpl, "busy", Busy);
  Nan::SetPrototypeMethod(tpl, "cancel", Cancel);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("Tracker").ToLocalChecked(), tpl->GetFunction());
}

NAN_METHOD(NodeTracker::New) {
  if (!info.IsConstructCall()) {
    // Invoked as plain function `Tracker(...)`, turn into construct call.
    const int argc = 5;
    v8::Local<v8::Value> argv[argc] = { info[0], info[1], info[2], info[3], info[4] };
    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance(argc, argv));
    return;
  }

  // Invoked as constructor: `new Tracker(...)`
  if (!info[0]->IsString()) {
    Nan::ThrowTypeError("Argument 0 not a string");
    return;
  }
  if (!info[1]->IsObject()) {
    Nan::ThrowTypeError("Argument 1 not a cv::Matrix");
    return;
  }
  if (!info[2]->IsObject()) {
    Nan::ThrowTypeError("Argument 2 not an object");
    return;
  }

  double confidence = NAN;
  if (info[4]->IsObject()) {
    v8::Local<v8::Object> opts = v8::Local<v8::Object>::Cast(info[4]);
    confidence = opts->Get(Nan::New<v8::String>("confidence").ToLocalChecked())->NumberValue();
  }

  v8::String::Utf8Value trackerName(info[0]->ToString());
  TrackerBase *tracker = NULL;
  if (0 == strcmp(*trackerName, "CMT")) {
    tracker = new CmtTracker(confidence);
  } else if (0 == strcmp(*trackerName, "DLIB")) {
    tracker = new DlibTracker(confidence);
  }
  if (tracker == NULL) {
    Nan::ThrowError("Unable to create tracker");
    return;
  }

  cv::Mat mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(info[1]->ToObject())->mat;
  int frameWidth = mat.size().width;
  int frameHeight = mat.size().height;

  v8::Local<v8::Object> rect = v8::Local<v8::Object>::Cast(info[2]);
  cv::Rect objectRect(
    rect->Get(Nan::New<v8::String>("x").ToLocalChecked())->IntegerValue(),
    rect->Get(Nan::New<v8::String>("y").ToLocalChecked())->IntegerValue(),
    rect->Get(Nan::New<v8::String>("width").ToLocalChecked())->IntegerValue(),
    rect->Get(Nan::New<v8::String>("height").ToLocalChecked())->IntegerValue()
  );

  Nan::Callback *callback = new Nan::Callback(info[3].As<v8::Function>());

  NodeTracker* obj = new NodeTracker(tracker, frameWidth, frameHeight);
  obj->state->busy = true;
  Nan::AsyncQueueWorker(new TrackerInitWorker(obj->state, mat, objectRect, callback));

  obj->Wrap(info.This());
  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeTracker::Busy) {
  NodeTracker* obj = ObjectWrap::Unwrap<NodeTracker>(info.Holder());
  info.GetReturnValue().Set(
    Nan::New<v8::Boolean>(!obj->state || obj->state->busy));
}

NAN_METHOD(NodeTracker::Cancel) {
  NodeTracker* obj = ObjectWrap::Unwrap<NodeTracker>(info.Holder());
  obj->state = NULL;
}

NAN_METHOD(NodeTracker::Update) {
  NodeTracker* obj = ObjectWrap::Unwrap<NodeTracker>(info.Holder());

  if (!obj->state || obj->state->busy) {
    Nan::ThrowError("Busy");
    return;
  }

  if (!info[0]->IsObject()) {
    Nan::ThrowTypeError("Argument 1 not a cv::Matrix");
    return;
  }
  cv::Mat mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(info[0]->ToObject())->mat;

  int frameWidth = mat.size().width;
  int frameHeight = mat.size().height;

  if (frameHeight != obj->frameHeight || frameWidth != obj->frameWidth) {
    Nan::ThrowTypeError("Argument 1 size mismatch");
    return;
  }
  obj->state->busy = true;
  Nan::Callback *callback = new Nan::Callback(info[1].As<v8::Function>());
  Nan::AsyncQueueWorker(new TrackerUpdateWorker(obj->state, mat, callback));
  info.GetReturnValue().Set(Nan::Null());
}

void Tracker_Init(v8::Local<v8::Object> exports) {
  NodeTracker::Init(exports);
}

