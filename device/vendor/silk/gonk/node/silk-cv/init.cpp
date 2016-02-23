/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>

void Cmt_Init(v8::Local<v8::Object> exports);
void Matrix_Init(v8::Local<v8::Object> exports);
void Mog2_Init(v8::Local<v8::Object> exports);
void Capture_Init(v8::Local<v8::Object> exports);

void Init(v8::Local<v8::Object> exports) {
  Cmt_Init(exports);
  Matrix_Init(exports);
  Mog2_Init(exports);
  Capture_Init(exports);
}

NODE_MODULE(bindings, Init)
