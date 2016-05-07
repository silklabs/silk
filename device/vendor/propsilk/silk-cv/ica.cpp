/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#include <nan.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-cv:ica"
#ifdef ANDROID
#include <utils/Log.h>
#else
#define ALOGV(fmt, args...) printf(LOG_TAG ": " fmt "\n", ##args);
#define ALOGE ALOGV
#define ALOGD ALOGV
#endif

#include "jade.h"

NAN_METHOD(Jade) {
  Nan::HandleScope scope;

  if (info.Length() < 3) {
    Nan::ThrowError("Invalid # of arguments provided");
  }

  std::vector<double> yChannel;
  v8::Handle<v8::Array> jsArray = v8::Handle<v8::Array>::Cast(info[0]);
  for (uint32_t i = 0; i < jsArray->Length(); i++) {
    yChannel.push_back(jsArray->Get(i)->NumberValue());
  }

  std::vector<double> cbChannel;
  jsArray = v8::Handle<v8::Array>::Cast(info[1]);
  for (uint32_t i = 0; i < jsArray->Length(); i++) {
    cbChannel.push_back(jsArray->Get(i)->NumberValue());
  }

  std::vector<double> crChannel;
  jsArray = v8::Handle<v8::Array>::Cast(info[2]);
  for (uint32_t i = 0; i < jsArray->Length(); i++) {
    crChannel.push_back(jsArray->Get(i)->NumberValue());
  }

  int nbc = 3;
  int nbs = jsArray->Length();
  std::vector<double> X;

  // Jade expects the data to be laid out in interleaved YCBCRs instead of Ys
  // followed by CBs and CRs
  for (int i = 0; i < nbs; i++) {
    X.push_back(yChannel[i]);
    X.push_back(cbChannel[i]);
    X.push_back(crChannel[i]);
  }

  double *B = (double *)calloc(nbc * nbc, sizeof(double));
  Jade(B, X.data(), nbc, nbs);
  // PrintMat(B, nbc, nbc);

  // Convert interleaved YCBCR to separate YCBCR array
  v8::Local<v8::Array> result = Nan::New<v8::Array>(nbc);
  for (int i = 0; i < nbc; ++i) {
    v8::Local<v8::Array> channel = Nan::New<v8::Array>(nbs);
    for (int j = 0; j < nbs; j++) {
      channel->Set(j, Nan::New<v8::Number>(X[i + j * nbc]));
    }
    result->Set(i, channel);
  }
  info.GetReturnValue().Set(result);
}

void Ica_Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;
  v8::Local<v8::Object> obj = Nan::New<v8::Object>();
  Nan::SetMethod(obj, "jade", Jade);

  exports->Set(Nan::New("Ica").ToLocalChecked(), obj);
}
