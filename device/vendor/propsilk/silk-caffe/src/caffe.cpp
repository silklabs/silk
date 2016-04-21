/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#include <nan.h>
#include "model.h"

void InitAll(v8::Local<v8::Object> exports) {
  Model::Init(exports);
}

NODE_MODULE(caffe, InitAll)
