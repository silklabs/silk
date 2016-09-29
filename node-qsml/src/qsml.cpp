/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#include <node.h>
#include <nan.h>

#include <qblas_cblas.h>
#include <qsml_extensions.h>

using v8::FunctionTemplate;
using v8::Handle;
using v8::Local;
using v8::Object;
using v8::Value;

using Nan::FunctionCallbackInfo;
using Nan::Maybe;
using Nan::MaybeLocal;
using Nan::New;
using Nan::ThrowTypeError;
using Nan::TypedArrayContents;
using Nan::To;
using Nan::Undefined;

// Get an argument
static Local<Value> Arg(const FunctionCallbackInfo<Value>& info, int n) {
  if (n < info.Length())
    return info[n];
  return Undefined();
}

static NAN_METHOD(sscal) {
  qsml_long N = To<uint32_t>(Arg(info, 0)).FromMaybe(0);
  float ALPHA = To<double>(Arg(info, 1)).FromMaybe(0);
  MaybeLocal<Object> x = To<Object>(Arg(info, 2));
  qsml_long INCX = To<uint32_t>(Arg(info, 3)).FromMaybe(0);
  if (x.IsEmpty())
    return ThrowTypeError("missing array");
  TypedArrayContents<float> x_array(x.ToLocalChecked());
  cblas_sscal(N, ALPHA, *x_array, INCX);
}

static NAN_METHOD(saxpy) {
  qsml_long N = To<uint32_t>(Arg(info, 0)).FromMaybe(0);
  float ALPHA = To<double>(Arg(info, 1)).FromMaybe(0);
  MaybeLocal<Object> x = To<Object>(Arg(info, 2));
  qsml_long INCX = To<uint32_t>(Arg(info, 3)).FromMaybe(0);
  MaybeLocal<Object> y = To<Object>(Arg(info, 4));
  qsml_long INCY = To<uint32_t>(Arg(info, 5)).FromMaybe(0);
  if (x.IsEmpty())
    return ThrowTypeError("missing x array");
  if (y.IsEmpty())
    return ThrowTypeError("missing y array");
  TypedArrayContents<float> x_array(x.ToLocalChecked());
  TypedArrayContents<float> y_array(y.ToLocalChecked());
  if (x_array.length() < size_t(N * INCX))
    return ThrowTypeError("array x too short");
  if (y_array.length() < size_t(N * INCY))
    return ThrowTypeError("array y too short");
  cblas_saxpy(N, ALPHA, *x_array, INCX, *y_array, INCY);
}

static NAN_METHOD(sgemm) {
  CBLAS_TRANSPOSE trans_a = CBLAS_TRANSPOSE(To<int32_t>(Arg(info, 0)).FromMaybe(CblasNoTrans));
  CBLAS_TRANSPOSE trans_b = CBLAS_TRANSPOSE(To<int32_t>(Arg(info, 1)).FromMaybe(CblasNoTrans));
  qsml_long M = To<uint32_t>(Arg(info, 2)).FromMaybe(0);
  qsml_long N = To<uint32_t>(Arg(info, 3)).FromMaybe(0);
  qsml_long K = To<uint32_t>(Arg(info, 4)).FromMaybe(0);
  float ALPHA = To<double>(Arg(info, 5)).FromMaybe(1);
  MaybeLocal<Object> a = To<Object>(Arg(info, 6));
  qsml_long lda = To<uint32_t>(Arg(info, 7)).FromMaybe(0);
  MaybeLocal<Object> b = To<Object>(Arg(info, 8));
  qsml_long ldb = To<uint32_t>(Arg(info, 9)).FromMaybe(0);
  float BETA = To<double>(Arg(info, 10)).FromMaybe(0);
  MaybeLocal<Object> c = To<Object>(Arg(info, 11));
  qsml_long ldc = To<uint32_t>(Arg(info, 12)).FromMaybe(0);
  if (a.IsEmpty())
    return ThrowTypeError("missing array a");
  if (b.IsEmpty())
    return ThrowTypeError("missing array b");
  if (c.IsEmpty())
    return ThrowTypeError("missing array c");
  TypedArrayContents<float> a_array(a.ToLocalChecked());
  TypedArrayContents<float> b_array(b.ToLocalChecked());
  TypedArrayContents<float> c_array(c.ToLocalChecked());
  if (a_array.length() < size_t(M * K))
    return ThrowTypeError("array a too short");
  if (b_array.length() < size_t(N * K))
    return ThrowTypeError("array b too short");
  if (c_array.length() < size_t(M * N))
    return ThrowTypeError("array c too short");
  cblas_sgemm(CblasRowMajor,
              trans_a, trans_b,
              M, N, K,
              ALPHA,
              *a_array, lda,
              *b_array, ldb,
              BETA,
              *c_array, ldc);
}

// Function uses casting from int to unsigned to compare if value of
// parameter a is greater or equal to zero and lower than value of
// parameter b. The b parameter is of type signed and is always positive,
// therefore its value is always lower than 0x800... where casting
// negative value of a parameter converts it to value higher than 0x800...
// The casting allows to use one condition instead of two.
inline bool is_a_ge_zero_and_a_lt_b(int a, int b) {
  return static_cast<unsigned>(a) < static_cast<unsigned>(b);
}

template <typename Dtype>
void im2col_cpu(const Dtype* data_im, const int channels,
    const int height, const int width, const int kernel_h, const int kernel_w,
    const int pad_h, const int pad_w,
    const int stride_h, const int stride_w,
    const int dilation_h, const int dilation_w,
    Dtype* data_col) {
  const int output_h = (height + 2 * pad_h -
    (dilation_h * (kernel_h - 1) + 1)) / stride_h + 1;
  const int output_w = (width + 2 * pad_w -
    (dilation_w * (kernel_w - 1) + 1)) / stride_w + 1;
  const int channel_size = height * width;
  for (int channel = channels; channel--; data_im += channel_size) {
    for (int kernel_row = 0; kernel_row < kernel_h; kernel_row++) {
      for (int kernel_col = 0; kernel_col < kernel_w; kernel_col++) {
        int input_row = -pad_h + kernel_row * dilation_h;
        for (int output_rows = output_h; output_rows; output_rows--) {
          if (!is_a_ge_zero_and_a_lt_b(input_row, height)) {
            for (int output_cols = output_w; output_cols; output_cols--) {
              *(data_col++) = 0;
            }
          } else {
            int input_col = -pad_w + kernel_col * dilation_w;
            for (int output_col = output_w; output_col; output_col--) {
              if (is_a_ge_zero_and_a_lt_b(input_col, width)) {
                *(data_col++) = data_im[input_row * width + input_col];
              } else {
                *(data_col++) = 0;
              }
              input_col += stride_w;
            }
          }
          input_row += stride_h;
        }
      }
    }
  }
}

static NAN_METHOD(sconv) {
  bool biased = To<bool>(Arg(info, 0)).FromMaybe(false);
  MaybeLocal<Object> src = To<Object>(Arg(info, 1));
  uint32_t srcWidth = To<uint32_t>(Arg(info, 2)).FromMaybe(0);
  uint32_t srcHeight = To<uint32_t>(Arg(info, 3)).FromMaybe(0);
  uint32_t srcChannels = To<uint32_t>(Arg(info, 4)).FromMaybe(0);
  MaybeLocal<Object> filters = To<Object>(Arg(info, 5));
  uint32_t numFilters = To<uint32_t>(Arg(info, 6)).FromMaybe(0);
  uint32_t filterX = To<uint32_t>(Arg(info, 7)).FromMaybe(0);
  uint32_t filterY = To<uint32_t>(Arg(info, 8)).FromMaybe(0);
  uint32_t padLeftRight = To<uint32_t>(Arg(info, 9)).FromMaybe(0);
  uint32_t padTopBottom = To<uint32_t>(Arg(info, 10)).FromMaybe(0);
  uint32_t strideX = To<uint32_t>(Arg(info, 11)).FromMaybe(0);
  uint32_t strideY = To<uint32_t>(Arg(info, 12)).FromMaybe(0);
  MaybeLocal<Object> output = To<Object>(Arg(info, 13));
  bool sconv = To<bool>(Arg(info, 14)).FromMaybe(false);
  if (src.IsEmpty())
    return ThrowTypeError("missing input array");
  if (filters.IsEmpty())
    return ThrowTypeError("missing filters array");
  if (output.IsEmpty())
    return ThrowTypeError("missing output array");
  TypedArrayContents<float> src_array(src.ToLocalChecked());
  TypedArrayContents<float> filters_array(filters.ToLocalChecked());
  TypedArrayContents<float> output_array(output.ToLocalChecked());
  if (src_array.length() < srcChannels * srcWidth * srcHeight)
    return ThrowTypeError("input array too short");
  if (filters_array.length() < numFilters * filterX * filterY)
    return ThrowTypeError("kernel array too short");
  uint32_t out_width = (srcWidth + 2 * padLeftRight - filterX) / strideX + 1;
  uint32_t out_height = (srcHeight + 2 * padTopBottom - filterY) / strideY + 1;
  if (output_array.length() < numFilters * out_width * out_height)
    return ThrowTypeError("output array too short");
  if (sconv) {
    float *fd = *filters_array;
    float *fq = new float[filterX * filterY * srcChannels * numFilters];
    for (size_t fy = 0; fy < filterY; ++fy) {
      for (size_t fx = 0; fx < filterX; ++fx) {
        for (size_t in_ch = 0; in_ch < srcChannels; ++in_ch) {
          for (size_t f = 0; f < numFilters; ++f) {
            fq[((fy * filterX + fx) * srcChannels + in_ch) * numFilters + f] =
              fd[((f * srcChannels + in_ch) * filterY + fy) * filterX + fx];
          }
        }
      }
    }
    float *id = *src_array;
    float *iq = new float[src_array.length()];
    for (size_t y = 0; y < srcHeight; ++y) {
      for (size_t x = 0; x < srcWidth; ++x) {
        for (size_t in_ch = 0; in_ch < srcChannels; ++in_ch) {
          iq[(y * srcWidth + x) * srcChannels + in_ch] =
            id[(in_ch * srcHeight + y) * srcWidth + x];
        }
      }
    }
    float *oq = new float[output_array.length()];
    sconv_mm(biased, iq, srcWidth, srcHeight, srcChannels,
             fq, numFilters, filterX, filterY, padLeftRight, padTopBottom, strideX, strideY,
             oq, out_width, out_height);
    float *od = *output_array;
    for (size_t y = 0; y < out_height; ++y) {
      for (size_t x = 0; x < out_width; ++x) {
        for (size_t f = 0; f < numFilters; ++f) {
          od[(f * out_height + y) * out_width + x] =
            oq[(y * out_width + x) * numFilters + f];
        }
      }
    }
    delete[] oq;
    delete[] iq;
    delete[] fq;
  } else {
    uint32_t out_channels = srcChannels * filterX * filterY;
    float *col = new float[out_channels * out_height * out_width];
    im2col_cpu(*src_array, srcChannels, srcHeight, srcWidth,
               filterY, filterX,
               padTopBottom, padLeftRight,
               strideY, strideX,
               1, 1, // dilation
               col);
    uint32_t M = numFilters;
    uint32_t N = out_width * out_height;
    uint32_t K = srcChannels * filterX * filterY;
    cblas_sgemm(CblasRowMajor, CblasNoTrans, CblasNoTrans,
                M, N, K,
                1,
                *filters_array, K,
                col, N,
                biased ? 1.0f : 0.0f,
                *output_array, N);
    delete[] col;
  }
}

void Init(Handle<Object> exports) {
  exports->Set(New("sscal").ToLocalChecked(), New<FunctionTemplate>(sscal)->GetFunction());
  exports->Set(New("saxpy").ToLocalChecked(), New<FunctionTemplate>(saxpy)->GetFunction());
  exports->Set(New("sgemm").ToLocalChecked(), New<FunctionTemplate>(sgemm)->GetFunction());
  exports->Set(New("sconv").ToLocalChecked(), New<FunctionTemplate>(sconv)->GetFunction());
  exports->Set(New("NoTrans").ToLocalChecked(), New(CblasNoTrans));
  exports->Set(New("Trans").ToLocalChecked(), New(CblasTrans));
}

NODE_MODULE(qsml, Init);
