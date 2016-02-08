/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>
#include "Matrix.h"
#include "CppMT/CMT.h"


/*
 * Implements the 'Cmt' Javascript class
 */
class Cmt: public Nan::ObjectWrap {
friend class CmtInitWorker;
friend class CmtFrameWorker;
public:
  static void Init(v8::Local<v8::Object> exports);

private:
  explicit Cmt(int frameWidth, int frameHeight, bool drawPoints = false)
    : frameWidth(frameWidth),
      frameHeight(frameHeight),
      drawPoints(drawPoints),
      initialized(false),
      processing(false) {}
  ~Cmt() {}

  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void NextFrame(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Busy(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;
  cmt::CMT cmt;
  int frameWidth;
  int frameHeight;
  bool drawPoints;

  bool initialized;
  bool processing;
};


/*
 * Async worker used to initialize a CMT object
 */
class CmtInitWorker : public Nan::AsyncWorker {
public:
  explicit CmtInitWorker(Cmt *nodeCmt, cv::Mat mat, cv::Rect rect, Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      mat(mat),
      rect(rect),
      nodeCmt(nodeCmt) {}
  virtual ~CmtInitWorker() {}

  void Execute() {
    nodeCmt->cmt.consensus.estimate_rotation = true;
    nodeCmt->cmt.initialize(mat, rect);
  }


  void HandleOKCallback () {
    Nan::HandleScope scope;

    nodeCmt->initialized = true;

    v8::Local<v8::Value> argv[] = {
      Nan::Null(),
    };

    callback->Call(1, argv);
  }

private:
  cv::Mat mat;
  cv::Rect rect;
  Cmt *nodeCmt;
};


/*
 * Async worker used to process the next frame for a CMT object
 */
class CmtFrameWorker : public Nan::AsyncWorker {
public:
  explicit CmtFrameWorker(Cmt *nodeCmt, cv::Mat mat, Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      mat(mat),
      nodeCmt(nodeCmt) {
    nodeCmt->processing = true;
  }
  virtual ~CmtFrameWorker() {}

  void Execute() {
    try {
      nodeCmt->cmt.processFrame(mat);
    } catch(...) {
      SetErrorMessage("Cmt threw!!");
      return;
    }

    if (nodeCmt->drawPoints) {
      // Active points
      for (size_t i = 0; i < nodeCmt->cmt.points_active.size(); i++) {
        circle(mat, nodeCmt->cmt.points_active[i], 2, cvScalar(255,0,0));
      }

      // Tracked rectangle
      Point2f vertices[4];
      nodeCmt->cmt.bb_rot.points(vertices);
      for (int i = 0; i < 4; i++) {
        line(mat, vertices[i], vertices[(i+1) % 4], cvScalar(255,0,0));
      }
    }
  }

  void HandleErrorCallback() {
    nodeCmt->processing = false;
    Nan::AsyncWorker::HandleErrorCallback();
  }

  void HandleOKCallback() {
    Nan::HandleScope scope;

    nodeCmt->processing = false;

    v8::Local<v8::Object> result = Nan::New<v8::Object>();

    result->Set(
      Nan::New<v8::String>("confidence").ToLocalChecked(),
      Nan::New<v8::Number>(nodeCmt->cmt.confidence)
    );

    result->Set(
      Nan::New<v8::String>("angle").ToLocalChecked(),
      Nan::New<v8::Number>(nodeCmt->cmt.bb_rot.angle)
    );

    cv::Size2f size = nodeCmt->cmt.bb_rot.size;
    v8::Local<v8::Object> sizeObject = Nan::New<v8::Object>();
    sizeObject->Set(Nan::New<v8::String>("width").ToLocalChecked(),
                    Nan::New<v8::Number>(size.width));
    sizeObject->Set(Nan::New<v8::String>("height").ToLocalChecked(),
                    Nan::New<v8::Number>(size.height));
    result->Set(Nan::New<v8::String>("size").ToLocalChecked(), sizeObject);

    cv::Rect rect = nodeCmt->cmt.bb_rot.boundingRect();
    v8::Local<v8::Object> rectObject = Nan::New<v8::Object>();
    rectObject->Set(Nan::New<v8::String>("x").ToLocalChecked(),
                   Nan::New<v8::Number>(rect.x));
    rectObject->Set(Nan::New<v8::String>("y").ToLocalChecked(),
                   Nan::New<v8::Number>(rect.y));
    rectObject->Set(Nan::New<v8::String>("width").ToLocalChecked(),
                   Nan::New<v8::Number>(rect.width));
    rectObject->Set(Nan::New<v8::String>("height").ToLocalChecked(),
                   Nan::New<v8::Number>(rect.height));
    result->Set(Nan::New<v8::String>("boundingRect").ToLocalChecked(), rectObject);

    v8::Local<v8::Value> argv[] = {
      Nan::Null(),
      result,
    };

    callback->Call(2, argv);
  }

private:
  cv::Mat mat;
  Cmt *nodeCmt;
};

Nan::Persistent<v8::Function> Cmt::constructor;

void Cmt::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("Cmt").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetPrototypeMethod(tpl, "nextFrame", NextFrame);
  Nan::SetPrototypeMethod(tpl, "busy", Busy);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("Cmt").ToLocalChecked(), tpl->GetFunction());
}

NAN_METHOD(Cmt::New) {
  if (!info.IsConstructCall()) {
    // Invoked as plain function `Cmt(...)`, turn into construct call.
    const int argc = 4;
    v8::Local<v8::Value> argv[argc] = { info[0], info[1], info[2], info[3] };
    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance(argc, argv));
    return;
  }

  // Invoked as constructor: `new Cmt(...)`
  if (!info[0]->IsObject()) {
    Nan::ThrowTypeError("Argument 1 not a cv::Matrix");
    return;
  }

  cv::Mat mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(info[0]->ToObject())->mat;

  if (mat.channels() > 1) {
    Nan::ThrowTypeError("Argument 1 not a grayscale matrix");
    return;
  }

  if (!info[1]->IsObject()) {
    Nan::ThrowTypeError("Argument 2 not an object");
    return;
  }

  int frameWidth = mat.size().width;
  int frameHeight = mat.size().height;

  v8::Local<v8::Object> rect = v8::Local<v8::Object>::Cast(info[1]);
  cv::Rect objectRect(
    rect->Get(Nan::New<v8::String>("x").ToLocalChecked())->IntegerValue(),
    rect->Get(Nan::New<v8::String>("y").ToLocalChecked())->IntegerValue(),
    rect->Get(Nan::New<v8::String>("width").ToLocalChecked())->IntegerValue(),
    rect->Get(Nan::New<v8::String>("height").ToLocalChecked())->IntegerValue()
  );

  Nan::Callback *callback = new Nan::Callback(info[2].As<v8::Function>());

  bool drawPoints = false;
  if (info[3]->IsObject()) {
    v8::Local<v8::Object> options = v8::Local<v8::Object>::Cast(info[3]);
    drawPoints = options->Get(
      Nan::New<v8::String>("drawPoints").ToLocalChecked())->BooleanValue();
  }

  Cmt* obj = new Cmt(frameWidth, frameHeight, drawPoints);

  Nan::AsyncQueueWorker(new CmtInitWorker(obj, mat, objectRect, callback));

  obj->Wrap(info.This());
  info.GetReturnValue().Set(info.This());
}


NAN_METHOD(Cmt::Busy) {
  Cmt* obj = ObjectWrap::Unwrap<Cmt>(info.Holder());
  info.GetReturnValue().Set(
    Nan::New<v8::Boolean>(!obj->initialized || obj->processing));
}

NAN_METHOD(Cmt::NextFrame) {
  Cmt* obj = ObjectWrap::Unwrap<Cmt>(info.Holder());

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

  if (mat.channels() > 1) {
    Nan::ThrowTypeError("Argument 1 not a grayscale matrix");
    return;
  }

  int frameWidth = mat.size().width;
  int frameHeight = mat.size().height;

  if (frameHeight != obj->frameHeight || frameWidth != obj->frameWidth) {
    Nan::ThrowTypeError("Argument 1 size mismatch");
    return;
  }
  Nan::Callback *callback = new Nan::Callback(info[1].As<v8::Function>());
  Nan::AsyncQueueWorker(new CmtFrameWorker(obj, mat, callback));
  info.GetReturnValue().Set(Nan::Null());
}

void Cmt_Init(v8::Local<v8::Object> exports) {
  Cmt::Init(exports);
}
