/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @noflow
 */

'use strict';

const cl = require('node-opencl');

const Shape = require('../../shape');
const Blob = require('../../blob');

const NoTrans = 111;
const Trans = 112;

// Derived from CLBlast by Cedric Nugteren <www.cedricnugteren.nl>,
// licensed under APL 2.0.

function IsMultiple(a, b) {
  return (Math.floor(a / b) * b) === a;
}

function CeilDiv(x, y) {
  return 1 + Math.floor((x - 1) / y);
}

function Ceil(x, y) {
  return CeilDiv(x, y) * y;
}

// Copies or transposes a matrix and optionally pads/unpads it with zeros. This method is also able
// to write to symmetric and triangular matrices through optional arguments.
function PadCopyTransposeMatrix(
  runtime,
  config,
  src_one, src_two,
  src_ld, src_offset,
  src,
  dest_one, dest_two,
  dest_ld, dest_offset,
  dest,
  do_pad, do_transpose
) {
  // Determines whether or not the fast-version could potentially be used
  let use_fast_kernel = (src_offset === 0) && (dest_offset === 0) &&
      (src_one === dest_one) && (src_two === dest_two) && (src_ld === dest_ld);

  // Determines the right kernel
  let kernel_name;
  if (do_transpose) {
    if (use_fast_kernel &&
        IsMultiple(src_ld, config.TRA_WPT) &&
        IsMultiple(src_one, config.TRA_WPT * config.TRA_WPT) &&
        IsMultiple(src_two, config.TRA_WPT * config.TRA_WPT)) {
      kernel_name = 'TransposeMatrixFast';
    } else {
      use_fast_kernel = false;
      kernel_name = (do_pad) ? 'TransposePadMatrix' : 'TransposeMatrix';
    }
  } else {
    if (use_fast_kernel &&
        IsMultiple(src_ld, config.COPY_VW) &&
        IsMultiple(src_one, config.COPY_VW * config.COPY_DIMX) &&
        IsMultiple(src_two, config.COPY_WPT * config.COPY_DIMY)) {
      kernel_name = 'CopyMatrixFast';
    } else {
      use_fast_kernel = false;
      kernel_name = (do_pad) ? 'CopyPadMatrix' : 'CopyMatrix';
    }
  }

  let kernel = runtime.kernel(kernel_name, config);
  // Sets the kernel arguments
  if (use_fast_kernel) {
    cl.setKernelArg(kernel, 0, 'int', src_ld);
    cl.setKernelArg(kernel, 1, 'float*', src.to_gpu());
    cl.setKernelArg(kernel, 2, 'float*', dest.to_gpu());
  } else {
    cl.setKernelArg(kernel, 0, 'int', src_one);
    cl.setKernelArg(kernel, 1, 'int', src_two);
    cl.setKernelArg(kernel, 2, 'int', src_ld);
    cl.setKernelArg(kernel, 3, 'int', src_offset);
    cl.setKernelArg(kernel, 4, 'float*', src.to_gpu());
    cl.setKernelArg(kernel, 5, 'int', dest_one);
    cl.setKernelArg(kernel, 6, 'int', dest_two);
    cl.setKernelArg(kernel, 7, 'int', dest_ld);
    cl.setKernelArg(kernel, 8, 'int', dest_offset);
    cl.setKernelArg(kernel, 9, 'float*', dest.to_gpu());
  }

  let global, local;
  if (do_transpose) {
    if (use_fast_kernel) {
      global = [dest_one / config.TRA_WPT, dest_two / config.TRA_PT];
      local = [config.TRA_DIM, config.TRA_DIM];
    } else {
      global = [Ceil(CeilDiv(dest_one, config.PADTRA_WPT), config.PADTRA_TILE),
                Ceil(CeilDiv(dest_two, config.PADTRA_WPT), config.PADTRA_TILE)];
      local = [config.PADTRA_TILE, config.PADTRA_TILE];
    }
  } else {
    if (use_fast_kernel) {
      global = [dest_one / config.COPY_VW, dest_two / config.CPY_WPT];
      local = [config.COPY_DIMX, config.COPY_DIMY];
    } else {
      global = [Ceil(CeilDiv(dest_one, config.PAD_WPTX), config.PAD_DIMX),
                Ceil(CeilDiv(dest_two, config.PAD_WPTY), config.PAD_DIMY)];
      local = [config.PAD_DIMX, config.PAD_DIMY];
    }
  }

  runtime.run(kernel, global, local, [src], dest);
}

function TestMatrix(one, two, buffer, offset, ld) {
  if (ld < one) {
    throw new Error('invalid lead dim');
  }
  const required_size = (ld * (two - 1) + one + offset);
  if (buffer.length < required_size) {
    throw new Error('buffer length too short');
  }
}

function gemm(
  runtime,
  config,
  a_transpose, b_transpose, c_transpose,
  m, n, k,
  a_buffer, a_offset, a_padded_one, a_padded_two,
  b_buffer, b_offset, b_padded_one, b_padded_two,
  c_buffer, c_offset, c_padded_one
) {
  // Makes sure all dimensions are larger than zero
  if ((m === 0) || (n === 0) || (k === 0)) {
    throw new Error('invalid dimension');
  }

  // Computes whether or not the matrices are transposed in memory. This is based on their layout
  // (row or column-major) and whether or not they are requested to be pre-transposed. Note
  // that the Xgemm kernel expects either matrices A and C (in case of row-major) or B (in case of
  // col-major) to be transformed, so transposing requirements are not the same as whether or not
  // the matrix is actually transposed in memory. Also, we actually only support row-major input
  // data here.
  const a_rotated = (a_transpose === NoTrans);
  const b_rotated = (b_transpose === NoTrans);
  const c_rotated = (c_transpose === NoTrans);
  const a_want_rotated = false;
  const b_want_rotated = true;
  const c_want_rotated = false;
  const a_do_transpose = a_rotated !== a_want_rotated;
  const b_do_transpose = b_rotated !== b_want_rotated;
  const c_do_transpose = c_rotated !== c_want_rotated;

  // Computes the first and second dimensions of the 3 matrices taking into account whether the
  // matrices are rotated or not
  const a_one = (a_rotated) ? k : m;
  const a_two = (a_rotated) ? m : k;
  const b_one = (b_rotated) ? n : k;
  const b_two = (b_rotated) ? k : n;
  const c_one = (c_rotated) ? n : m;
  const c_two = (c_rotated) ? m : n;

  TestMatrix(a_one, a_two, a_buffer, a_offset, a_padded_one);
  TestMatrix(b_one, b_two, b_buffer, b_offset, b_padded_one);
  TestMatrix(c_one, c_two, c_buffer, c_offset, c_padded_one);

  // Calculates the ceiled versions of m, n, and k
  const m_ceiled = Ceil(m, config.MWG);
  const n_ceiled = Ceil(n, config.NWG);
  const k_ceiled = Ceil(k, config.KWG);

  // Computes the first and second "internal" (ceiled) dimensions of the 3 matrices taking into account
  // whether the matrices need to be rotated or not for the kernel.
  const a_one_i = (a_want_rotated) ? k_ceiled : m_ceiled;
  const a_two_i = (a_want_rotated) ? m_ceiled : k_ceiled;
  const b_one_i = (b_want_rotated) ? n_ceiled : k_ceiled;
  const b_two_i = (b_want_rotated) ? k_ceiled : n_ceiled;
  const c_one_i = (c_want_rotated) ? n_ceiled : m_ceiled;
  const c_two_i = (c_want_rotated) ? m_ceiled : n_ceiled;

  // Determines whether or not temporary matrices are needed
  const a_no_temp = a_one === a_one_i && a_two === a_two_i && a_padded_one === a_one && a_offset === 0 &&
          a_do_transpose === false;
  const b_no_temp = b_one === b_one_i && b_padded_two === b_two_i && b_padded_one === b_one && b_offset === 0 &&
          b_do_transpose === false;
  const c_no_temp = c_one === c_one_i && c_two === c_two_i && c_padded_one === c_one && c_offset === 0 &&
          c_do_transpose === false;

  let temps = [];

  // Use the CL runtime to obtain temporary buffers and release them when we exit
  function allocateTemporary(w, h) {
    let blob = new Blob(new Shape(1, 1, h, w));
    runtime.allocate(blob);
    temps.push(blob);
    return blob.buffer;
  }

  function releaseTemporaryBuffers() {
    temps.forEach(blob => runtime.release(blob));
  }

  // Creates the temporary matrices
  const a_temp = (a_no_temp) ? a_buffer : allocateTemporary(a_one_i, a_two_i);
  const b_temp = (b_no_temp) ? b_buffer : allocateTemporary(b_one_i, b_two_i);
  const c_temp = (c_no_temp) ? c_buffer : allocateTemporary(c_one_i, c_two_i);

  // Runs the pre-processing kernel for matrix A. This transposes the matrix, but also pads zeros
  // to fill it up until it reaches a certain multiple of size (kernel parameter dependent). In
  // case nothing has to be done, these kernels can be skipped.
  if (!a_no_temp) {
    PadCopyTransposeMatrix(runtime,
                           config,
                           a_one, a_two, a_padded_one, a_offset, a_buffer,
                           a_one_i, a_two_i, a_one_i, 0, a_temp,
                           true, a_do_transpose);
  }

  // As above, but now for matrix B
  if (!b_no_temp) {
    PadCopyTransposeMatrix(runtime,
                           config,
                           b_one, b_two, b_padded_one, b_offset, b_buffer,
                           b_one_i, b_two_i, b_one_i, 0, b_temp,
                           true, b_do_transpose);
  }

  let kernel = runtime.kernel('Xgemm', config);
  cl.setKernelArg(kernel, 0, 'int', m_ceiled);
  cl.setKernelArg(kernel, 1, 'int', n_ceiled);
  cl.setKernelArg(kernel, 2, 'int', k_ceiled);
  cl.setKernelArg(kernel, 3, 'float*', a_temp.to_gpu());
  cl.setKernelArg(kernel, 4, 'float*', b_temp.to_gpu());
  cl.setKernelArg(kernel, 5, 'float*', c_temp.to_gpu());

  let global = [(c_one_i * config.MDIMC) / config.MWG,
                (c_two_i * config.NDIMC) / config.NWG];
  let local = [config.MDIMC, config.NDIMC];
  let deps = [a_temp, b_temp];
  if (!c_no_temp) {
    deps.push(c_temp);
  }
  runtime.run(kernel, global, local, deps, c_temp, 2 * m_ceiled * n_ceiled * k_ceiled);

  // Runs the post-processing kernel if needed
  if (!c_no_temp) {
    PadCopyTransposeMatrix(runtime,
                           config,
                           c_one_i, c_two_i, c_one_i, 0, c_temp,
                           c_one, c_two, c_padded_one, c_offset, c_buffer,
                           false, c_do_transpose);
  }

  releaseTemporaryBuffers();
}

module.exports = {
  Trans: Trans,
  NoTrans: NoTrans,
  gemm: gemm,
};
