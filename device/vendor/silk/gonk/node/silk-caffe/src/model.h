/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#ifndef MODEL_H
#define MODEL_H

#include <nan.h>
#include <string.h>

#include "caffe/caffe.hpp"
#include "opencv2/core/core.hpp"
#include "opencv/cv.h"
#include "opencv/highgui.h"

using namespace std;
using namespace caffe;
using namespace v8;
using namespace node;

/* Pair (label, confidence) representing a prediction. */
typedef std::pair<string, float> Prediction;

#define REQ_FUN_ARG(I, VAR) \
  if (info.Length() <= (I) || !info[I]->IsFunction()) { \
    return Nan::ThrowTypeError("Argument " #I " must be a function"); \
  } \
  Local<Function> VAR = Local<Function>::Cast(info[I]);

#define SETUP_FUNCTION(TYP) \
  Nan::HandleScope scope; \
  TYP *self = Nan::ObjectWrap::Unwrap<TYP>(info.Holder());

#define JSFUNC(NAME) \
  static NAN_METHOD(NAME);

#define JSTHROW_TYPE(ERR) \
  Nan::ThrowTypeError(ERR); \
  return

#define JSTHROW(ERR) \
  Nan::ThrowError(ERR); \
  return

#define INT_FROM_ARGS(NAME, IND) \
  if (info[IND]->IsInt32()) { \
    NAME = info[IND]->Uint32Value(); \
  }

#define STRING_FROM_ARGS(NAME, IND) \
  if (info[IND]->IsString()) { \
    NAME = string(*Nan::Utf8String(info[IND]->ToString())); \
  }

#define BOOL_FROM_ARGS(NAME, IND) \
  if (info[IND]->IsBoolean()) { \
    NAME = info[IND]->BooleanValue(); \
  }

/**
 * This class is a wrapper around Caffe DNN library
 */
class Model : public Nan::ObjectWrap {
public:
  static void Init(v8::Local<v8::Object> exports);
  vector<Prediction> Classify(const cv::Mat& img, int topK);

private:
  explicit Model();
  ~Model();
  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;
  vector<float> Predict(const cv::Mat& img);
  void WrapInputLayer(vector<cv::Mat>* inputChannels);
  void Preprocess(const cv::Mat& img, vector<cv::Mat>* inputChannels);

  JSFUNC(Load);
  JSFUNC(SetMean);
  JSFUNC(SetScale);
  JSFUNC(SetLabels);
  JSFUNC(PredictTopK);
  JSFUNC(PredictRegions);

public:
  boost::shared_ptr<Net<float>> mCaffeNet;
  cv::Size mInputGeometry;
  int mNumChannels;
  cv::Mat mMean;
  float mScale;
  std::vector<string> mLabels;
};

#endif
