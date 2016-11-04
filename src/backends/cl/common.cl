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
// This file contains the common defines and type-defs for the CLBlast OpenCL kernels.
//
// =================================================================================================

// Parameters set by the tuner or by the database. Here they are given a basic default value in case
// this file is used outside of the CLBlast library.
#ifndef PRECISION
  #define PRECISION 32      // Data-types: half, single or double precision, complex or regular
#endif

// =================================================================================================

// Enable support for double-precision
#if PRECISION == 16
  #pragma OPENCL EXTENSION cl_khr_fp16: enable
#endif

// Enable support for double-precision
#if PRECISION == 64 || PRECISION == 6464
  #if __OPENCL_VERSION__ <= CL_VERSION_1_1
     #pragma OPENCL EXTENSION cl_khr_fp64: enable
  #endif
#endif

// Half-precision
#if PRECISION == 16
  #define real half
  #define ZERO 0
  #define ONE 1
  #define SMALLEST -1.0e14
  typedef half half1;

// Single-precision
#elif PRECISION == 32
  #define real float
  #define ZERO 0.0f
  #define ONE 1.0f
  #define SMALLEST -1.0e37f
  typedef float float1;

// Double-precision
#else
  #define real double
  #define ZERO 0.0
  #define ONE 1.0
  #define SMALLEST -1.0e37
  typedef double double1;
#endif

#define CONCAT(a, b) a ## b
#define VEC(type, n) CONCAT(type, n)

// =================================================================================================

// Don't use the non-IEEE754 compliant OpenCL built-in mad() instruction per default. For specific
// devices, this is enabled (see src/routine.cc).
#ifndef USE_CL_MAD
  #define USE_CL_MAD 0
#endif

// Sets a variable to zero
#define SetToZero(a) a = ZERO

// Determines whether a variable is zero
#if USE_CL_MAD == 1
  #define MultiplyAdd(c, a, b) c = mad(a, b, c)
#else
  #define MultiplyAdd(c, a, b) c += a * b
#endif

// The scalar AXPBY function
#define AXPBY(e, a, b, c, d) e = a*b + c*d

// =================================================================================================

// Shuffled workgroup indices to avoid partition camping, see below. For specific devices, this is
// enabled (see src/routine.cc).
#ifndef USE_STAGGERED_INDICES
  #define USE_STAGGERED_INDICES 0
#endif

// Staggered/shuffled group indices to avoid partition camping (AMD GPUs). Formula's are taken from:
// http://docs.nvidia.com/cuda/samples/6_Advanced/transpose/doc/MatrixTranspose.pdf
// More details: https://github.com/CNugteren/CLBlast/issues/53
#if USE_STAGGERED_INDICES == 1
  inline size_t GetGroupIDFlat() {
    return get_group_id(0) + get_num_groups(0) * get_group_id(1);
  }
  inline size_t GetGroupID1() {
    return (GetGroupIDFlat()) % get_num_groups(1);
  }
  inline size_t GetGroupID0() {
    return ((GetGroupIDFlat() / get_num_groups(1)) + GetGroupID1()) % get_num_groups(0);
  }
#else
  inline size_t GetGroupID1() { return get_group_id(1); }
  inline size_t GetGroupID0() { return get_group_id(0); }
#endif

// =================================================================================================
