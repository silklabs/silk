/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>
#include <opencv2/opencv.hpp>
#include <dlib/image_processing/frontal_face_detector.h>
#include <dlib/image_processing/shape_predictor.h>
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
  dlib::shape_predictor face_landmark_predictor;

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
    try {
      dlib::deserialize("system/silk/media/shape_predictor_68_face_landmarks.dat") >>
        nodeFaceDetector->face_landmark_predictor;
    } catch(const dlib::serialization_error &e) {
      SetErrorMessage(e.what());
      return;
    }
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
  struct FaceRect {
    dlib::rectangle boundingBox;
    dlib::point leftEye;
    dlib::point rightEye;
  };

  explicit FaceDetectorUpdateWorker(FaceDetector *nodeFaceDetector, cv::Mat mat, Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      mat(mat),
      nodeFaceDetector(nodeFaceDetector) {
    nodeFaceDetector->processing = true;
  }
  virtual ~FaceDetectorUpdateWorker() {}

  void Execute() {
    auto img = dlib::cv_image<unsigned char>(mat);
    std::vector<dlib::rectangle> foundFaces = nodeFaceDetector->detector(img);

    for (unsigned i = 0; i < foundFaces.size(); ++i) {

      // Find face landmarks
      dlib::full_object_detection shape =
        nodeFaceDetector->face_landmark_predictor(img, foundFaces[i]);

      long left = LONG_MAX;
      long top = LONG_MAX;
      long right = LONG_MIN;
      long bottom = LONG_MIN;

      // See this image for the positions of the 68 landmarks:
      //   http://ibug.doc.ic.ac.uk/media/uploads/images/300-w/figure_1_68.jpg
      if (shape.num_parts() != 68) {
        SetErrorMessage("Expected 68 parts");
        return;
      }

      for (unsigned p = 0; p < shape.num_parts(); p++) {
        dlib::point pt = shape.part(p);

        if (pt.x() < left) {
          left = pt.x();
        }
        if (pt.x() > right) {
          right = pt.x();
        }
        if (pt.y() < top) {
          top = pt.y();
        }
        if (pt.y() > bottom) {
          bottom = pt.y();
        }

        // TODO: Only draw on the image when requested!
        cv::circle(mat, cv::Point2f(pt.x(), pt.y()), 2,
          cv::Scalar(255, 255, 255));
      }

      // Adjust the face rectangle to be ~10% larger than the bounding box of
      // all the facial landmarks.  Empirically this usually produces a very
      // nice bounding box
      long xdilate = (right - left) * 0.10;
      long ydilate = (bottom - top) * 0.10;
      FaceRect face;
      face.boundingBox = dlib::rectangle(
        left - xdilate,
        top - ydilate,
        right + xdilate,
        bottom + ydilate
      );

      // Estimate the center of the left and right eyes
      dlib::point lefteye_left = shape.part(37);
      dlib::point lefteye_right = shape.part(40);
      dlib::point righteye_left = shape.part(43);
      dlib::point righteye_right = shape.part(46);

      face.leftEye = dlib::point(
        (lefteye_left.x() + lefteye_right.x()) / 2,
        (lefteye_left.y() + lefteye_right.y()) / 2
      );
      face.rightEye = dlib::point(
        (righteye_left.x() + righteye_right.x()) / 2,
        (righteye_left.y() + righteye_right.y()) / 2
      );

      faces.push_back(face);
    }
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
      face->Set(Nan::New("x").ToLocalChecked(),
        Nan::New<v8::Number>(faces[i].boundingBox.left()));
      face->Set(Nan::New("y").ToLocalChecked(),
        Nan::New<v8::Number>(faces[i].boundingBox.top()));
      face->Set(Nan::New("width").ToLocalChecked(),
        Nan::New<v8::Number>(faces[i].boundingBox.width()));
      face->Set(Nan::New("height").ToLocalChecked(),
        Nan::New<v8::Number>(faces[i].boundingBox.height()));

      v8::Local<v8::Array> leftEyeArray = Nan::New<v8::Array>(2);
      leftEyeArray->Set(0, Nan::New<v8::Number>(faces[i].leftEye.x()));
      leftEyeArray->Set(1, Nan::New<v8::Number>(faces[i].leftEye.y()));
      face->Set(Nan::New("leftEye").ToLocalChecked(), leftEyeArray);

      v8::Local<v8::Array> rightEyeArray = Nan::New<v8::Array>(2);
      rightEyeArray->Set(0, Nan::New<v8::Number>(faces[i].rightEye.x()));
      rightEyeArray->Set(1, Nan::New<v8::Number>(faces[i].rightEye.y()));
      face->Set(Nan::New("rightEye").ToLocalChecked(), rightEyeArray);

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
  std::vector<FaceRect> faces;
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

