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

/**
 * Calculates an average (mean) of elements in YVU420SP matrix.
 * Note that U and V are flipped in the raw frame on Android
 *
 * @return an array of mean for Y, U(Cb) and V(Cr)
 */
NAN_METHOD(YVU420SPMean) {
  Nan::HandleScope scope;

  if (info.Length() < 1) {
    Nan::ThrowError("Invalid number of parameters specified");
    return;
  }

  cv::Mat mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(info[0]->ToObject())->mat;

  int width = mat.size().width;
  int height = mat.size().height * 2 / 3; // Actual height of the image
  int xmin = 0;
  int ymin = 0;
  int xmax = width;
  int ymax = height;

  if (info.Length() >=2 ) {
    v8::Handle <v8::Object> rect = v8::Local<v8::Object>::Cast(info[1]);
    xmin = rect->Get(Nan::New<v8::String>("x").ToLocalChecked())->IntegerValue();
    ymin = rect->Get(Nan::New<v8::String>("y").ToLocalChecked())->IntegerValue();
    xmax = xmin + rect->Get(Nan::New<v8::String>("width").ToLocalChecked())->IntegerValue();
    ymax = ymin + rect->Get(Nan::New<v8::String>("height").ToLocalChecked())->IntegerValue();
  }

  int total = width * height;
  std::vector<uchar> luma, cb, cr;

  for (int y = ymin; y < ymax; ++y) {
    for (int x = xmin; x < xmax; ++x) {
      int uvOffset = (y >> 1) * (width >> 1) + (x >> 1);
      // Since U and V channels are interleaved, offsets need
      // to be doubled.
      uvOffset = uvOffset * 2;
      uvOffset = uvOffset + total; // UV starts after all Luma pixels

      luma.push_back(mat.at<uchar>(y, x));

      int voffsety = uvOffset / width;
      int voffsetx = uvOffset % width;
      cr.push_back(mat.at<uchar>(voffsety, voffsetx));

      int uoffsety = (uvOffset + 1) / width;
      int uoffsetx = (uvOffset + 1) % width;
      cb.push_back(mat.at<uchar>(uoffsety, uoffsetx));
    }
  }

  float sum = 0;
  for (uint32_t i = 0; i < luma.size(); i++) {
    sum = sum + luma[i];
  }
  float meanY = sum / luma.size();

  sum = 0;
  for (uint32_t i = 0; i < cb.size(); i++) {
    sum = sum + cb[i];
  }
  float meanCb = sum / cb.size();;

  sum = 0;
  for (uint32_t i = 0; i < cr.size(); i++) {
    sum = sum + cr[i];
  }
  float meanCr = sum / cr.size();

  v8::Local <v8::Array> arr = Nan::New<v8::Array>(3);
  arr->Set(0, Nan::New<v8::Number>(meanY));
  arr->Set(1, Nan::New<v8::Number>(meanCb));
  arr->Set(2, Nan::New<v8::Number>(meanCr));

  info.GetReturnValue().Set(arr);
}

void Matrix_Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;
  v8::Local<v8::Object> obj = Nan::New<v8::Object>();
  Nan::SetMethod(obj, "erodeWithBlackBorder", ErodeWithBlackBorder);
  Nan::SetMethod(obj, "yvu420spMean", YVU420SPMean);

  exports->Set(Nan::New("Matrix").ToLocalChecked(), obj);
}
