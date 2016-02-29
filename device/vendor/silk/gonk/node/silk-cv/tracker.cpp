/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>
#include <opencv2/opencv.hpp>

#if CV_MAJOR_VERSION < 3
#warning Building with OpenCV 2.x, Tracker disabled
void Tracker_Init(v8::Local<v8::Object> exports) {
  (void) exports;
}
#else
#include <opencv2/tracking.hpp>
#include <opencv2/imgproc.hpp>
#include "Matrix.h"
#include "trackerCMT.hpp"

/*
 * Implements the 'Tracker' Javascript class
 */
class Tracker: public Nan::ObjectWrap {
friend class TrackerInitWorker;
friend class TrackerUpdateWorker;
public:
  static void Init(v8::Local<v8::Object> exports);

private:
  explicit Tracker(cv::Ptr<cv::Tracker> tracker, int frameWidth, int frameHeight)
    : tracker(tracker),
      frameWidth(frameWidth),
      frameHeight(frameHeight),
      initialized(false),
      processing(false) {}
  ~Tracker() {}

  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Update(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Busy(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;
  cv::Ptr<cv::Tracker> tracker;
  int frameWidth;
  int frameHeight;

  bool initialized;
  bool processing;
};


/*
 * Async worker used to initialize a Tracker object
 */
class TrackerInitWorker : public Nan::AsyncWorker {
public:
  explicit TrackerInitWorker(Tracker *nodeTracker, cv::Mat mat, cv::Rect2d rect, Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      mat(mat),
      rect(rect),
      nodeTracker(nodeTracker) {}
  virtual ~TrackerInitWorker() {}

  void Execute() {
    bool success;
    try {
      success = nodeTracker->tracker->init(mat, rect);
    } catch(const std::exception &e) {
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

    nodeTracker->initialized = true;

    v8::Local<v8::Value> argv[] = {
      Nan::Null(),
    };

    callback->Call(1, argv);
  }

private:
  cv::Mat mat;
  cv::Rect2d rect;
  Tracker *nodeTracker;
};


/*
 * Async worker used to process the next frame for a Tracker object
 */
class TrackerUpdateWorker : public Nan::AsyncWorker {
public:
  explicit TrackerUpdateWorker(Tracker *nodeTracker, cv::Mat mat, Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      mat(mat),
      rect(),
      found(false),
      nodeTracker(nodeTracker) {
    nodeTracker->processing = true;
  }
  virtual ~TrackerUpdateWorker() {}

  void Execute() {
    try {
      rect.x = rect.y = rect.width = rect.height = -1;
      found = nodeTracker->tracker->update(mat, rect);
    } catch(const std::exception &e) {
      SetErrorMessage(e.what());
    }
  }

  void HandleErrorCallback() {
    nodeTracker->processing = false;
    Nan::AsyncWorker::HandleErrorCallback();
  }

  void HandleOKCallback() {
    Nan::HandleScope scope;

    nodeTracker->processing = false;

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
    };
    callback->Call(3, argv);
  }

private:
  cv::Mat mat;
  cv::Rect2d rect;
  bool found;
  Tracker *nodeTracker;
};

Nan::Persistent<v8::Function> Tracker::constructor;

void Tracker::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("Tracker").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetPrototypeMethod(tpl, "update", Update);
  Nan::SetPrototypeMethod(tpl, "busy", Busy);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("Tracker").ToLocalChecked(), tpl->GetFunction());
}

NAN_METHOD(Tracker::New) {
  if (!info.IsConstructCall()) {
    // Invoked as plain function `Tracker(...)`, turn into construct call.
    const int argc = 4;
    v8::Local<v8::Value> argv[argc] = { info[0], info[1], info[2], info[3] };
    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance(argc, argv));
    return;
  }

  // Invoked as constructor: `new Tracker(...)`
  if (!info[0]->IsString()) {
    Nan::ThrowTypeError("Argument 0 not a string");
    return;
  }
  v8::String::Utf8Value trackerName(info[0]->ToString());
  cv::Ptr<cv::Tracker> tracker;
  if (0 == strcmp(*trackerName, "CMT")) {
    tracker = new CmtTracker();
  } else {
    tracker = cv::Tracker::create(*trackerName);
  }
  if (tracker == NULL) {
    Nan::ThrowError("Unable to create tracker");
    return;
  }

  if (!info[1]->IsObject()) {
    Nan::ThrowTypeError("Argument 1 not a cv::Matrix");
    return;
  }

  cv::Mat mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(info[1]->ToObject())->mat;
  int frameWidth = mat.size().width;
  int frameHeight = mat.size().height;

  if (!info[1]->IsObject()) {
    Nan::ThrowTypeError("Argument 2 not an object");
    return;
  }

  v8::Local<v8::Object> rect = v8::Local<v8::Object>::Cast(info[2]);
  cv::Rect2d objectRect(
    rect->Get(Nan::New<v8::String>("x").ToLocalChecked())->IntegerValue(),
    rect->Get(Nan::New<v8::String>("y").ToLocalChecked())->IntegerValue(),
    rect->Get(Nan::New<v8::String>("width").ToLocalChecked())->IntegerValue(),
    rect->Get(Nan::New<v8::String>("height").ToLocalChecked())->IntegerValue()
  );

  Nan::Callback *callback = new Nan::Callback(info[3].As<v8::Function>());

  Tracker* obj = new Tracker(tracker, frameWidth, frameHeight);
  Nan::AsyncQueueWorker(new TrackerInitWorker(obj, mat, objectRect, callback));

  obj->Wrap(info.This());
  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(Tracker::Busy) {
  Tracker* obj = ObjectWrap::Unwrap<Tracker>(info.Holder());
  info.GetReturnValue().Set(
    Nan::New<v8::Boolean>(!obj->initialized || obj->processing));
}

NAN_METHOD(Tracker::Update) {
  Tracker* obj = ObjectWrap::Unwrap<Tracker>(info.Holder());

  if (!obj->initialized) {
    Nan::ThrowTypeError("Not initialized");
    return;
  }
  if (obj->processing) {
    Nan::ThrowTypeError("Busy");
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
  Nan::Callback *callback = new Nan::Callback(info[1].As<v8::Function>());
  Nan::AsyncQueueWorker(new TrackerUpdateWorker(obj, mat, callback));
  info.GetReturnValue().Set(Nan::Null());
}

void Tracker_Init(v8::Local<v8::Object> exports) {
  Tracker::Init(exports);
}

#endif
