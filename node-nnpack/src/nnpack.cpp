/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * See LICENSE.
 */

#include <node.h>
#include <nan.h>

#include <nnpack.h>

using v8::Float32Array;
using v8::FunctionTemplate;
using v8::Handle;
using v8::Local;
using v8::Object;
using v8::Uint32;
using v8::Value;

using node::AtExit;

using Nan::FunctionCallbackInfo;
using Nan::Maybe;
using Nan::MaybeLocal;
using Nan::New;
using Nan::ThrowTypeError;
using Nan::To;
using Nan::TypedArrayContents;
using Nan::Undefined;

static pthreadpool_t threadpool;

// Get an argument
static Local<Value> Arg(const FunctionCallbackInfo<Value>& info, int n) {
  if (n < info.Length()) {
    return info[n];
  }
  return Undefined();
}

static NAN_METHOD(Relu) {
  uint32_t batch_size = To<uint32_t>(Arg(info, 0)).FromMaybe(0);
  uint32_t channels = To<uint32_t>(Arg(info, 1)).FromMaybe(0);
  MaybeLocal<Object> input = To<Object>(Arg(info, 2));
  MaybeLocal<Object> output = To<Object>(Arg(info, 3));
  double negative_slope = To<double>(Arg(info, 4)).FromMaybe(0);
  if (input.IsEmpty()) {
    return ThrowTypeError("missing input array");
  }
  if (output.IsEmpty()) {
    return ThrowTypeError("missing output array");
  }
  TypedArrayContents<float> input_array(input.ToLocalChecked());
  TypedArrayContents<float> output_array(output.ToLocalChecked());
  if (input_array.length() < batch_size * channels) {
    return ThrowTypeError("input array too short");
  }
  if (output_array.length() < batch_size * channels) {
    return ThrowTypeError("output array too short");
  }
  info.GetReturnValue().Set(int32_t(nnp_relu_output(batch_size,
                                                    channels,
                                                    *input_array,
                                                    *output_array,
                                                    negative_slope,
                                                    threadpool)));
}

static NAN_METHOD(FullyConnected) {
  uint32_t input_channels = To<uint32_t>(Arg(info, 0)).FromMaybe(0);
  uint32_t output_channels = To<uint32_t>(Arg(info, 1)).FromMaybe(0);
  MaybeLocal<Object> input = To<Object>(Arg(info, 2));
  MaybeLocal<Object> kernel = To<Object>(Arg(info, 3));
  MaybeLocal<Object> output = To<Object>(Arg(info, 4));
  if (input.IsEmpty()) {
    return ThrowTypeError("missing input array");
  }
  if (kernel.IsEmpty()) {
    return ThrowTypeError("missing kernel array");
  }
  if (output.IsEmpty()) {
    return ThrowTypeError("missing output array");
  }
  TypedArrayContents<float> input_array(input.ToLocalChecked());
  TypedArrayContents<float> kernel_array(kernel.ToLocalChecked());
  TypedArrayContents<float> output_array(output.ToLocalChecked());
  if (input_array.length() < input_channels) {
    return ThrowTypeError("input array too short");
  }
  if (kernel_array.length() < input_channels * output_channels) {
    return ThrowTypeError("kernel array too short");
  }
  if (output_array.length() < output_channels) {
    return ThrowTypeError("output array too short");
  }
  info.GetReturnValue().Set(int32_t(nnp_fully_connected_inference(input_channels,
                                                                  output_channels,
                                                                  *input_array,
                                                                  *kernel_array,
                                                                  *output_array,
                                                                  threadpool)));
}

static NAN_METHOD(MaxPooling) {
  nnp_size input_size;
  nnp_padding padding;
  nnp_size kernel_size;
  nnp_size kernel_stride;
  uint32_t batch_size = To<uint32_t>(Arg(info, 0)).FromMaybe(0);
  uint32_t channels = To<uint32_t>(Arg(info, 1)).FromMaybe(0);
  input_size.width = To<uint32_t>(Arg(info, 2)).FromMaybe(0);
  input_size.height = To<uint32_t>(Arg(info, 3)).FromMaybe(0);
  padding.top = To<uint32_t>(Arg(info, 4)).FromMaybe(0);
  padding.right = To<uint32_t>(Arg(info, 5)).FromMaybe(0);
  padding.bottom = To<uint32_t>(Arg(info, 6)).FromMaybe(0);
  padding.left = To<uint32_t>(Arg(info, 7)).FromMaybe(0);
  kernel_size.width = To<uint32_t>(Arg(info, 8)).FromMaybe(0);
  kernel_size.height = To<uint32_t>(Arg(info, 9)).FromMaybe(0);
  kernel_stride.width = To<uint32_t>(Arg(info, 10)).FromMaybe(0);
  kernel_stride.height = To<uint32_t>(Arg(info, 11)).FromMaybe(0);
  MaybeLocal<Object> input = To<Object>(Arg(info, 12));
  MaybeLocal<Object> output = To<Object>(Arg(info, 13));
  if (input.IsEmpty()) {
    return ThrowTypeError("missing input array");
  }
  if (output.IsEmpty()) {
    return ThrowTypeError("missing output array");
  }
  TypedArrayContents<float> input_array(input.ToLocalChecked());
  TypedArrayContents<float> output_array(output.ToLocalChecked());
  if (input_array.length() < batch_size * channels * input_size.width * input_size.height) {
    return ThrowTypeError("input array too short");
  }
  uint32_t out_width = (input_size.width + padding.left + padding.right - kernel_size.width + 1) / kernel_stride.width + 1;
  uint32_t out_height = (input_size.height + padding.top + padding.bottom - kernel_size.height + 1) / kernel_stride.height + 1;
  if (output_array.length() < batch_size * channels * out_width * out_height) {
    return ThrowTypeError("output array too short");
  }
  info.GetReturnValue().Set(int32_t(nnp_max_pooling_output(batch_size,
                                                           channels,
                                                           input_size,
                                                           padding,
                                                           kernel_size,
                                                           kernel_stride,
                                                           *input_array,
                                                           *output_array,
                                                           threadpool)));
}

static NAN_METHOD(Convolution) {
  nnp_size input_size;
  nnp_padding padding;
  nnp_size kernel_size;
  nnp_size kernel_stride;
  size_t input_channels = To<uint32_t>(Arg(info, 0)).FromMaybe(0);
  size_t output_channels = To<uint32_t>(Arg(info, 1)).FromMaybe(0);
  input_size.width = To<uint32_t>(Arg(info, 2)).FromMaybe(0);
  input_size.height = To<uint32_t>(Arg(info, 3)).FromMaybe(0);
  padding.top = To<uint32_t>(Arg(info, 4)).FromMaybe(0);
  padding.right = To<uint32_t>(Arg(info, 5)).FromMaybe(0);
  padding.bottom = To<uint32_t>(Arg(info, 6)).FromMaybe(0);
  padding.left = To<uint32_t>(Arg(info, 7)).FromMaybe(0);
  kernel_size.width = To<uint32_t>(Arg(info, 8)).FromMaybe(0);
  kernel_size.height = To<uint32_t>(Arg(info, 9)).FromMaybe(0);
  kernel_stride.width = To<uint32_t>(Arg(info, 10)).FromMaybe(0);
  kernel_stride.height = To<uint32_t>(Arg(info, 11)).FromMaybe(0);
  MaybeLocal<Object> input = To<Object>(Arg(info, 12));
  MaybeLocal<Object> kernel = To<Object>(Arg(info, 13));
  MaybeLocal<Object> bias = To<Object>(Arg(info, 14));
  MaybeLocal<Object> output = To<Object>(Arg(info, 15));
  if (input.IsEmpty()) {
    return ThrowTypeError("missing input array");
  }
  if (kernel.IsEmpty()) {
    return ThrowTypeError("missing kernel array");
  }
  if (bias.IsEmpty()) {
    return ThrowTypeError("missing bias array");
  }
  if (output.IsEmpty()) {
    return ThrowTypeError("missing output array");
  }
  TypedArrayContents<float> input_array(input.ToLocalChecked());
  TypedArrayContents<float> kernel_array(kernel.ToLocalChecked());
  TypedArrayContents<float> bias_array(bias.ToLocalChecked());
  TypedArrayContents<float> output_array(output.ToLocalChecked());
  if (input_array.length() < input_channels * input_size.width * input_size.height) {
    return ThrowTypeError("input array too short");
  }
  if (kernel_array.length() < output_channels * kernel_size.width * kernel_size.height) {
    return ThrowTypeError("kernel array too short");
  }
  if (bias_array.length() < output_channels) {
    return ThrowTypeError("bias array too short");
  }
  uint32_t out_width = (input_size.width + padding.left + padding.right - kernel_size.width) / kernel_stride.width + 1;
  uint32_t out_height = (input_size.height + padding.top + padding.bottom - kernel_size.height) / kernel_stride.height + 1;
  if (output_array.length() < output_channels * out_width * out_height) {
    return ThrowTypeError("output array too short");
  }
  info.GetReturnValue().Set(int32_t(nnp_convolution_inference(nnp_convolution_algorithm_auto,
                                                              nnp_convolution_transform_strategy_tuple_based,
                                                              input_channels,
                                                              output_channels,
                                                              input_size,
                                                              padding,
                                                              kernel_size,
                                                              kernel_stride,
                                                              *input_array,
                                                              *kernel_array,
                                                              *bias_array,
                                                              *output_array,
                                                              threadpool,
                                                              nullptr)));
}

static NAN_GETTER(GetThreads) {
  info.GetReturnValue().Set(uint32_t(pthreadpool_get_threads_count(threadpool)));
}

void Exit(void *) {
  nnp_deinitialize();
  if (threadpool) {
    pthreadpool_destroy(threadpool);
  }
}

void Init(Handle<Object> exports) {
  AtExit(Exit);
  // create a thread pool to be used by this module
  threadpool = pthreadpool_create(0);
  nnp_initialize();
  SetAccessor(exports, New("threads").ToLocalChecked(), GetThreads);
  exports->Set(New("relu").ToLocalChecked(), New<FunctionTemplate>(Relu)->GetFunction());
  exports->Set(New("fullyConnected").ToLocalChecked(), New<FunctionTemplate>(FullyConnected)->GetFunction());
  exports->Set(New("maxPooling").ToLocalChecked(), New<FunctionTemplate>(MaxPooling)->GetFunction());
  exports->Set(New("convolution").ToLocalChecked(), New<FunctionTemplate>(Convolution)->GetFunction());
}

NODE_MODULE(NNPACK, Init);
