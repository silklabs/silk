/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <memory>
#include <nan.h>
#include <opencv2/opencv.hpp>
#include <dlib/image_processing/frontal_face_detector.h>
#include <dlib/image_processing/shape_predictor.h>
#include <dlib/opencv/cv_image.h>
#include "Matrix.h"

#define LOG_TAG "silk-cv:fd"
#ifdef ANDROID
#include <utils/Log.h>
#else
#ifdef LOG_NDEBUG
#define ALOGD(LOG_TAG fmt, args...) printf(fmt, ##args)
#else
#define ALOGD(fmt, args...)
#endif
#endif

struct State {
  dlib::frontal_face_detector detector;
  dlib::shape_predictor face_landmark_predictor;
  bool busy;
  State() : busy(false) {};
};

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
    : state(new State()) {}
  ~FaceDetector() {}

  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Detect(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Busy(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Cancel(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;

  std::shared_ptr<State> state;
};


/*
 * Async worker used to initialize a FaceDetector object
 */
class FaceDetectorInitWorker : public Nan::AsyncWorker {
public:
  explicit FaceDetectorInitWorker(std::weak_ptr<State> weakState,
                                  std::string dlibLandmark,
                                  Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      dlibLandmark(dlibLandmark),
      weakState(weakState) {}
  virtual ~FaceDetectorInitWorker() {}

  void Execute() {
    auto state = weakState.lock();
    if (state) {
      state->detector = dlib::get_frontal_face_detector();
      ALOGD("Loading %s", dlibLandmark.c_str());
      try {
        dlib::deserialize(dlibLandmark) >>
          state->face_landmark_predictor;
      } catch(const dlib::serialization_error &e) {
        SetErrorMessage(e.what());
      }
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
  std::string dlibLandmark;
  std::weak_ptr<State> weakState;
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
    dlib::rectangle forhead;
  };

  explicit FaceDetectorUpdateWorker(std::weak_ptr<State> weakState, cv::Mat mat, Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      mat(mat),
      weakState(weakState) {}
  virtual ~FaceDetectorUpdateWorker() {}

  void Execute() {
    auto state = weakState.lock();
    if (!state) {
      return;
    }

    auto img = dlib::cv_image<unsigned char>(mat);
    std::vector<dlib::rectangle> foundFaces = state->detector(img);

    for (unsigned i = 0; i < foundFaces.size(); ++i) {

      // Find face landmarks
      dlib::full_object_detection shape =
        state->face_landmark_predictor(img, foundFaces[i]);

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
      long xdilate = static_cast<float>(right - left) * 0.10;
      long ydilate = static_cast<float>(bottom - top) * 0.10;
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

      // Estimate the forehead
      // Area between the top of the face (head) and the eyebrows
      dlib::point lefteyebrowstart = shape.part(17);
      dlib::point righteyebrowend = shape.part(26);
      dlib::point lefteyebrowtop = shape.part(19);
      dlib::point righteyebrowtop = shape.part(24);

      // Choose the eyebrow which is higher (lower y-axis)
      long bottomforehead;
      if (lefteyebrowtop.y() < righteyebrowtop.y()) {
        bottomforehead = lefteyebrowtop.y();
      } else {
        bottomforehead = righteyebrowtop.y();
      }

      // Dilate a bit more to capture more of the forehead
      long ydilateForehead = static_cast<float>(bottom - top) * 0.20;
      face.forhead = dlib::rectangle(
        lefteyebrowstart.x(),
        top - ydilateForehead,
        righteyebrowend.x(),
        bottomforehead
      );

      faces.push_back(face);
    }
  }

  void HandleErrorCallback() {
    auto state = weakState.lock();
    if (state) {
      state->busy = false;
    }

    Nan::AsyncWorker::HandleErrorCallback();
  }

  void HandleOKCallback() {
    Nan::HandleScope scope;

    auto state = weakState.lock();
    if (state) {
      state->busy = false;

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

        v8::Local<v8::Object> forhead = Nan::New<v8::Object>();
        forhead->Set(Nan::New("x").ToLocalChecked(),
          Nan::New<v8::Number>(faces[i].forhead.left()));
        forhead->Set(Nan::New("y").ToLocalChecked(),
          Nan::New<v8::Number>(faces[i].forhead.top()));
        forhead->Set(Nan::New("width").ToLocalChecked(),
          Nan::New<v8::Number>(faces[i].forhead.width()));
        forhead->Set(Nan::New("height").ToLocalChecked(),
          Nan::New<v8::Number>(faces[i].forhead.height()));
        face->Set(Nan::New("forehead").ToLocalChecked(), forhead);

        facesArray->Set(i, face);
      }

      v8::Local<v8::Value> argv[] = {
        Nan::Null(),
        facesArray,
      };
      callback->Call(2, argv);
    }
  }

private:
  cv::Mat mat;
  std::vector<FaceRect> faces;
  std::weak_ptr<State> weakState;
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
  if (info.Length() != 2) {
    Nan::ThrowError("Invalid number of arguments provided (required two)");
  }

  if (!info.IsConstructCall()) {
    // Invoked as plain function `FaceDetector(...)`, turn into construct call.
    const int argc = 2;
    v8::Local<v8::Value> argv[argc] = { info[0], info[1] };
    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance(argc, argv));
    return;
  }

  // Invoked as constructor: `new FaceDetector(...)`
  std::string dlibLandmark = std::string(*Nan::Utf8String(info[0]->ToString()));
  Nan::Callback *callback = new Nan::Callback(info[1].As<v8::Function>());

  FaceDetector* obj = new FaceDetector();
  obj->state->busy = true;
  Nan::AsyncQueueWorker(new FaceDetectorInitWorker(obj->state, dlibLandmark,
                                                   callback));

  obj->Wrap(info.This());
  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(FaceDetector::Busy) {
  FaceDetector* obj = ObjectWrap::Unwrap<FaceDetector>(info.Holder());
  info.GetReturnValue().Set(
    Nan::New<v8::Boolean>(!obj->state || obj->state->busy));
}

NAN_METHOD(FaceDetector::Cancel) {
  FaceDetector* obj = ObjectWrap::Unwrap<FaceDetector>(info.Holder());
  obj->state = NULL;
}

NAN_METHOD(FaceDetector::Detect) {
  FaceDetector* obj = ObjectWrap::Unwrap<FaceDetector>(info.Holder());

  if (!obj->state || obj->state->busy) {
    Nan::ThrowError("Busy");
    return;
  }

  if (!info[0]->IsObject()) {
    Nan::ThrowTypeError("Argument 1 not a cv::Matrix");
    return;
  }
  cv::Mat mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(info[0]->ToObject())->mat;

  obj->state->busy = true;
  Nan::Callback *callback = new Nan::Callback(info[1].As<v8::Function>());
  Nan::AsyncQueueWorker(new FaceDetectorUpdateWorker(obj->state, mat, callback));
  info.GetReturnValue().Set(Nan::Null());
}

void FaceDetector_Init(v8::Local<v8::Object> exports) {
  FaceDetector::Init(exports);
}

