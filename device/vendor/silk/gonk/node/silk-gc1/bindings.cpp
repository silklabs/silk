/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>

NAN_METHOD(IdleNotification) {
  Nan::HandleScope scope;

  if (info.Length() != 1 || !info[0]->IsUint32()) {
    return Nan::ThrowError("Expected only one uint32 argument: idle_time_in_ms");
  }
  int idle_time_in_ms = info[0]->Uint32Value();
  info.GetReturnValue().Set(Nan::IdleNotification(idle_time_in_ms));
}

void init(v8::Handle<v8::Object> exports)
{
  exports->Set(Nan::New<v8::String>("idleNotification").ToLocalChecked(),
    Nan::New<v8::FunctionTemplate>(IdleNotification)->GetFunction());
}

NODE_MODULE(gc1, init)
