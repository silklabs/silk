/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>
#include <opencv2/opencv.hpp>
#if CV_MAJOR_VERSION >= 3
#include <opencv2/imgproc.hpp>
#endif
#include "Matrix.h"


NAN_METHOD(ErodeWithBlackBorder) {
  Nan::HandleScope scope;
  cv::Mat mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(info[0]->ToObject())->mat;
  int iters = info[1]->NumberValue();

  cv::Mat kernel = cv::Mat();
  cv::Scalar color(0, 0, 0);
  cv::erode(mat, mat, kernel, cv::Point(-1, -1), iters, cv::BORDER_CONSTANT, color);
}


void Matrix_Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;
  v8::Local<v8::Object> obj = Nan::New<v8::Object>();
  Nan::SetMethod(obj, "erodeWithBlackBorder", ErodeWithBlackBorder);

  exports->Set(Nan::New("Matrix").ToLocalChecked(), obj);
}
