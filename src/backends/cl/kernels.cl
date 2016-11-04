/* -*- Mode: C; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#if PRECISION == 32
#define Dtype float
#endif

#if PRECISION == 16
#define Dtype half
#pragma OPENCL EXTENSION cl_khr_fp16: enable
#endif

__kernel void to_float(int n, __global const Dtype *in, __global float *out) {
  for (int i = get_global_id(0); i < n; i += get_global_size(0)) {
    out[i] = (float) in[i];
  }
}

__kernel void from_float(int n, __global const float *in, __global Dtype *out) {
  for (int i = get_global_id(0); i < n; i += get_global_size(0)) {
    out[i] = (Dtype) in[i];
  }
}

static Dtype relu_kernel(Dtype val, const float negative_slope) {
  return fmax(val, 0) + negative_slope * fmin(val, 0);
}

static Dtype bias_and_scale_kernel(Dtype val, const int i, const int spatial_stride, const int num_channels,
                                   __constant const Dtype *biases, __constant const Dtype *scales) {
  int c = (i / spatial_stride) % num_channels;
  return (val + biases[c]) * scales[c];
}

__kernel void bias_and_scale_and_relu(const int n, const int spatial_stride, const int num_channels, __global Dtype* data,
                                      __constant const Dtype *biases, __constant const Dtype *scales,
                                      float negative_slope) {
  for (int i = get_global_id(0); i < n; i += get_global_size(0)) {
    Dtype val = data[i];
    val = bias_and_scale_kernel(val, i, spatial_stride, num_channels, biases, scales);
    val = relu_kernel(val, negative_slope);
    data[i] = val;
  }
}

static void index_to_bchw(const int i, int *b, int *c, int *y, int *x, const int out_channels, const int out_height, const int out_width) {
  *x = i % out_width;
  *y = (i / out_width) % out_height;
  *c = (i / out_width / out_height) % out_channels;
  *b = i / out_width / out_height / out_channels;
}

static int bchw_to_index(const int b, const int c, const int y, const int x, const int channels, const int height, const int width) {
  return (((b * channels) + c) * height + y) * width + x;
}

static bool valid_spatial_coordinates(const int x, const int y, const int in_width, const int in_height) {
  return x >= 0 && x < in_width && y >= 0 && y < in_height;
}

__kernel void max_pooling(const int nthreads,
                          __global const Dtype *in_data, int in_height, const int in_width,
                          const int filter_size, const int filter_stride, const int filter_pad,
                          __global Dtype *out_data, const int out_n, const int out_channels, const int out_height, const int out_width,
                          float negative_slope) {
  for (int i = get_global_id(0); i < nthreads; i += get_global_size(0)) {
    int b, c, y, x;
    index_to_bchw(i, &b, &c, &y, &x, out_channels, out_height, out_width);
    Dtype maxval = -FLT_MAX;
    for (int n = 0; n < filter_size; ++n) {
      for (int m = 0; m < filter_size; ++m) {
        int in_x = -filter_pad + x * filter_stride + m;
        int in_y = -filter_pad + y * filter_stride + n;
        if (valid_spatial_coordinates(in_x, in_y, in_width, in_height)) {
          maxval = fmax(maxval, in_data[bchw_to_index(b, c, in_y, in_x, out_channels, in_height, in_width)]);
        }
      }
    }
    out_data[i] = relu_kernel(maxval, negative_slope);
  }
}

__kernel void gemv(const int m, const int n, __global const Dtype *a, __global const Dtype *x, __global Dtype *y,
                   __local Dtype *work) {
  Dtype sum = 0.0f;

  int i = get_global_id(0);
  if (i < m) {
    for (int k = get_global_id(1); k < n; k += get_global_size(1))
      sum += a[i*n + k] * x[k];
  }

  int rows = get_local_size(0);
  int cols = get_local_size(1);
  int ii = get_local_id(0);
  int jj = get_local_id(1);

  work[ii + rows * jj] = sum;

  barrier(CLK_LOCAL_MEM_FENCE);

  while (cols > 1) {
    cols >>= 1;
    if (jj < cols)
      work[ii + rows * jj] += work[ii + rows * (jj + cols)];
    barrier(CLK_LOCAL_MEM_FENCE);
  }

  if (i < m && jj == 0) {
    y[i] = work[ii];
  }
}

__kernel void im2col(__global const Dtype *in_data, const int in_data_offset, const int in_channels, const int in_height, const int in_width,
                     const int filter_size, const int filter_stride, const int filter_pad,
                     __global Dtype *out_data, const int out_channels, const int out_height, const int out_width) {
  in_data += in_data_offset;
  int i = get_global_id(0);
  int b, in_c, out_y, out_x;
  index_to_bchw(i, &b, &in_c, &out_y, &out_x, out_channels, out_height, out_width);
  if (b == 0) {
    for (int fy = 0; fy < filter_size; ++fy) {
      for (int fx = 0; fx < filter_size; ++fx) {
        int out_c = (in_c * filter_size + fy) * filter_size + fx;
        int in_y = (out_y * filter_stride + fy) - filter_pad;
        int in_x = (out_x * filter_stride + fx) - filter_pad;
        Dtype val = 0.f;
        if (valid_spatial_coordinates(in_x, in_y, in_width, in_height))
          val = in_data[(in_c * in_height + in_y) * in_width + in_x];
        out_data[out_c * (out_width * out_height) + out_y * out_width + out_x] = val;
      }
    }
  }
}
