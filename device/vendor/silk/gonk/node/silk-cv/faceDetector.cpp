/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>
#include <opencv2/opencv.hpp>
#include <dlib/image_processing/frontal_face_detector.h>
#include <dlib/opencv/cv_image.h>
#include "Matrix.h"

/*
 * Implements the 'FaceDetector' Javascript class
 */
class FaceDetector: public Nan::ObjectWrap {
friend class FaceDetectorInitWorker;
friend class FaceDetectorUpdateWorker;
public:
  static void Init(v8::Local<v8::Object> exports);

private:
  explicit FaceDetector()
    : initialized(false),
      cancelled(false),
      processing(false) {}
  ~FaceDetector() {}

  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Detect(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Busy(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Cancel(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;
  dlib::frontal_face_detector detector;

  bool initialized;
  bool cancelled;
  bool processing;
};


/*
 * Async worker used to initialize a FaceDetector object
 */
class FaceDetectorInitWorker : public Nan::AsyncWorker {
public:
  explicit FaceDetectorInitWorker(FaceDetector *nodeFaceDetector, Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      nodeFaceDetector(nodeFaceDetector) {}
  virtual ~FaceDetectorInitWorker() {}

  void Execute() {
    nodeFaceDetector->detector = dlib::get_frontal_face_detector();
  }

  void HandleOKCallback () {
    if (nodeFaceDetector->cancelled) {
      return;
    }

    Nan::HandleScope scope;
    nodeFaceDetector->initialized = true;

    v8::Local<v8::Value> argv[] = {
      Nan::Null(),
    };
    callback->Call(1, argv);
  }

private:
  FaceDetector *nodeFaceDetector;
};


/*
 * Async worker used to process the next frame for a FaceDetector object
 */
class FaceDetectorUpdateWorker : public Nan::AsyncWorker {
public:
  explicit FaceDetectorUpdateWorker(FaceDetector *nodeFaceDetector, cv::Mat mat, Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      mat(mat),
      nodeFaceDetector(nodeFaceDetector) {
    nodeFaceDetector->processing = true;
  }
  virtual ~FaceDetectorUpdateWorker() {}

  void Execute() {
    // TODO: is grayscale ok here?!
    faces = nodeFaceDetector->detector(dlib::cv_image<unsigned char>(mat));
  }

  void HandleErrorCallback() {
    if (nodeFaceDetector->cancelled) {
      return;
    }

    nodeFaceDetector->processing = false;
    Nan::AsyncWorker::HandleErrorCallback();
  }

  void HandleOKCallback() {
    if (nodeFaceDetector->cancelled) {
      return;
    }

    Nan::HandleScope scope;
    nodeFaceDetector->processing = false;

    v8::Local<v8::Array> facesArray = Nan::New<v8::Array>(faces.size());

    for (unsigned i = 0; i < faces.size(); i++) {
      v8::Local<v8::Object> face = Nan::New<v8::Object>();
      face->Set(Nan::New("x").ToLocalChecked(), Nan::New<v8::Number>(faces[i].left()));
      face->Set(Nan::New("y").ToLocalChecked(), Nan::New<v8::Number>(faces[i].top()));
      face->Set(Nan::New("width").ToLocalChecked(), Nan::New<v8::Number>(faces[i].width()));
      face->Set(Nan::New("height").ToLocalChecked(), Nan::New<v8::Number>(faces[i].height()));
      facesArray->Set(i, face);
    }

    v8::Local<v8::Value> argv[] = {
      Nan::Null(),
      facesArray,
    };
    callback->Call(2, argv);
  }

private:
  cv::Mat mat;
  std::vector<dlib::rectangle> faces;
  FaceDetector *nodeFaceDetector;
};

Nan::Persistent<v8::Function> FaceDetector::constructor;

void FaceDetector::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("FaceDetector").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetPrototypeMethod(tpl, "detect", Detect);
  Nan::SetPrototypeMethod(tpl, "busy", Busy);
  Nan::SetPrototypeMethod(tpl, "cancel", Cancel);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("FaceDetector").ToLocalChecked(), tpl->GetFunction());
}

NAN_METHOD(FaceDetector::New) {
  if (!info.IsConstructCall()) {
    // Invoked as plain function `FaceDetector(...)`, turn into construct call.
    const int argc = 1;
    v8::Local<v8::Value> argv[argc] = { info[0] };
    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance(argc, argv));
    return;
  }

  // Invoked as constructor: `new FaceDetector(...)`
  Nan::Callback *callback = new Nan::Callback(info[0].As<v8::Function>());

  FaceDetector* obj = new FaceDetector();
  Nan::AsyncQueueWorker(new FaceDetectorInitWorker(obj, callback));

  obj->Wrap(info.This());
  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(FaceDetector::Busy) {
  FaceDetector* obj = ObjectWrap::Unwrap<FaceDetector>(info.Holder());
  info.GetReturnValue().Set(
    Nan::New<v8::Boolean>(!obj->initialized || obj->processing));
}

NAN_METHOD(FaceDetector::Cancel) {
  FaceDetector* obj = ObjectWrap::Unwrap<FaceDetector>(info.Holder());

  obj->cancelled = true;
  obj->processing = true;
}

NAN_METHOD(FaceDetector::Detect) {
  FaceDetector* obj = ObjectWrap::Unwrap<FaceDetector>(info.Holder());

  if (!obj->initialized) {
    Nan::ThrowError("Not initialized");
    return;
  }
  if (obj->processing) {
    Nan::ThrowError("Busy");
    return;
  }

  if (!info[0]->IsObject()) {
    Nan::ThrowTypeError("Argument 1 not a cv::Matrix");
    return;
  }
  cv::Mat mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(info[0]->ToObject())->mat;

  Nan::Callback *callback = new Nan::Callback(info[1].As<v8::Function>());
  Nan::AsyncQueueWorker(new FaceDetectorUpdateWorker(obj, mat, callback));
  info.GetReturnValue().Set(Nan::Null());
}

void FaceDetector_Init(v8::Local<v8::Object> exports) {
  FaceDetector::Init(exports);
}

