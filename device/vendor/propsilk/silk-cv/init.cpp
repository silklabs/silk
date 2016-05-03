/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>
#include <opencv2/opencv.hpp>

#if CV_MAJOR_VERSION < 3
#warning Building with OpenCV 2.x, please install OpenCV 3.x
#endif

void Capture_Init(v8::Local<v8::Object> exports);
void FaceDetector_Init(v8::Local<v8::Object> exports);
void Matrix_Init(v8::Local<v8::Object> exports);
void Mog2_Init(v8::Local<v8::Object> exports);
void Tracker_Init(v8::Local<v8::Object> exports);
void Ica_Init(v8::Local<v8::Object> exports);

void Init(v8::Local<v8::Object> exports) {
  Capture_Init(exports);
  FaceDetector_Init(exports);
  Matrix_Init(exports);
  Mog2_Init(exports);
  Tracker_Init(exports);
  Ica_Init(exports);
}

NODE_MODULE(bindings, Init)
