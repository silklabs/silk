/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>

void Cmt_Init(v8::Local<v8::Object> exports); // from Cmt.cpp

void Init(v8::Local<v8::Object> exports) {
  Cmt_Init(exports);
}

NODE_MODULE(bindings, Init)
