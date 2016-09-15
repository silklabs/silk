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

using std::string;
using std::vector;

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

#define FLOAT_FROM_ARGS(NAME, IND) \
  NAME = info[IND]->NumberValue(); \

/**
 * This class is a wrapper around Caffe DNN library
 */
class Model : public Nan::ObjectWrap {
public:
  static void Init(v8::Local<v8::Object> exports);
  vector<Prediction> Classify(const cv::Mat& img, int topK);
  vector<Prediction> Classify(vector<vector<float>> &array, int topK);

private:
  explicit Model();
  ~Model();
  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;
  template<typename Dtype> vector<Prediction> Predict(caffe::Blob<Dtype>* blob, int topK);
  cv::Mat Preprocess(const cv::Mat& img);
  template<typename Dtype> void cvMatToBlob(const cv::Mat& image,
      caffe::Blob<Dtype>* blob);
  template<typename Dtype> void arrayToBlob(vector<vector<float>> &array,
      caffe::Blob<Dtype>* blob);

  JSFUNC(Load);
  JSFUNC(SetMean);
  JSFUNC(SetLabels);
  JSFUNC(PredictTopK);
  JSFUNC(Rcnn);
  JSFUNC(NonMaximaSuppression);
  JSFUNC(Time);

public:
  boost::shared_ptr<caffe::Net<float>> caffeNet;
  cv::Size inputGeometry;
  int numChannels;
  cv::Mat mean;
  bool meanAvailable;
  std::vector<string> labels;
};

#endif
