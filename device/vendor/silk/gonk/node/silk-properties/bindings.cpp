/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#include <nan.h>
#include <cutils/properties.h>

NAN_METHOD(GetProperty) {
  Nan::HandleScope scope;

  if (info.Length() != 1 || !info[0]->IsString()) {
    return Nan::ThrowError("Expected only one string argument: GetProperty");
  }

  char property_value[PROPERTY_VALUE_MAX];
  const char* default_value = "";
  char *property_name = *Nan::Utf8String(info[0]);
  int len = property_get(property_name, property_value, default_value);

  info.GetReturnValue().Set(
      Nan::New<v8::String>(property_value, len).ToLocalChecked()
  );
}

void init(v8::Handle<v8::Object> exports)
{
  exports->Set(Nan::New<v8::String>("get").ToLocalChecked(),
    Nan::New<v8::FunctionTemplate>(GetProperty)->GetFunction());
}

NODE_MODULE(properties, init)
