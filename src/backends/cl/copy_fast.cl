/* -*- Mode: C; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// =================================================================================================
// This file is part of the CLBlast project. The project is licensed under Apache Version 2.0. This
// project loosely follows the Google C++ styleguide and uses a tab-size of two spaces and a max-
// width of 100 characters per line.
//
// Author(s):
//   Cedric Nugteren <www.cedricnugteren.nl>
//
// This file contains the common kernels shared among different BLAS routines. This file contains
// kernels to copy matrices.
//
// =================================================================================================

// =================================================================================================

typedef VEC(real, COPY_VW) realC;

// =================================================================================================

// Fast copy kernel. Requires 'ld' and the number of threads in dimension 0 to be a multiple of
// COPY_VW. Also requires both matrices to be of the same dimensions and without offset.
__kernel __attribute__((reqd_work_group_size(COPY_DIMX, COPY_DIMY, 1)))
void CopyMatrixFast(const int ld,
                    __global const realC* restrict src,
                    __global realC* dest) {
  #pragma unroll
  for (int w_one=0; w_one<COPY_WPT; ++w_one) {
    const int id_one = get_global_id(0);
    const int id_two = (get_group_id(1)*COPY_WPT + w_one) * COPY_DIMY + get_local_id(1);
    const int id = id_two*(ld/COPY_VW) + id_one;
    dest[id] = src[id];
  }
}

// =================================================================================================
