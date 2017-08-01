#ifndef LIBPREVIEW_H
#define LIBPREVIEW_H

#include <dlfcn.h>
#include <stdio.h>

namespace libpreview {

// Max number of locked frame without stalling the preview pipeline.
#define MAX_UNLOCKED_FRAMES 2

typedef enum {
  FRAMEFORMAT_INVALID,

  // 32bit RGB
  FRAMEFORMAT_RGB,

  // Packed NV21.
  // Stride == Width, VU plane immediately follows Y plane
  FRAMEFORMAT_YVU420SP,

  // Packed NV12.
  // Stride == Width, UV plane immediately follows Y plane
  FRAMEFORMAT_YUV420SP,

  // Venus NV21.
  // Stride == Width aligned to 128.
  // VU plane starts at Stride * (Height aligned to 32)
  //
  // Macros:
  // * VENUS_Y_STRIDE to compute Y stride
  // * VENUS_C_STRIDE to compute VU/UV stride
  // * VENUS_C_PLANE_OFFSET to locate VU plane offset from start of Y plane
  FRAMEFORMAT_YVU420SP_VENUS,

  // Venus NV12.
  // Stride == Width aligned to 128.
  // UV plane starts at Stride * (Height aligned to 32)
  //
  // Macros: same as Venus NV21
  FRAMEFORMAT_YUV420SP_VENUS,
} FrameFormat;

static __inline__ int __VENUS_ALIGN(int value, int align) {
  return (value + (align-1)) & ~(align-1);
}

static __inline__ int VENUS_Y_STRIDE(int width) {
  auto stride = __VENUS_ALIGN(width, 128);
  return stride;
}

static __inline__ int VENUS_C_PLANE_OFFSET(int width, int height) {
  auto stride = VENUS_Y_STRIDE(width);
  auto scanlines = __VENUS_ALIGN(height, 32);
  return stride * scanlines;
}

static __inline__ int VENUS_C_STRIDE(int width) {
  return VENUS_Y_STRIDE(width);
}

typedef void *FrameOwner;

class Client {
 public:
  virtual void addref() = 0;
  virtual void release() = 0;
  virtual void getSize(size_t &width, size_t &height) = 0;
  virtual void stopFrameCallback() = 0;
  virtual void releaseFrame(FrameOwner owner) = 0;
 protected:
  virtual ~Client() = 0;
};

typedef void (*FrameCallback)(void *userData,
                              void *frame,
                              FrameFormat format,
                              size_t width,
                              size_t height,
                              FrameOwner owner);
typedef void (*AbandonedCallback)(void *userData);

typedef Client *(*OpenFunc)(FrameCallback frameCallback,
                            AbandonedCallback abandonedCallback,
                            void *userData);

static __inline Client *open(FrameCallback frameCallback,
                             AbandonedCallback abandonedCallback,
                             void *userData) {
  static void *handle = NULL;

  if (handle == NULL) {
    handle = dlopen("/silk/lib/libpreview.so", RTLD_NOW);
    if (handle == NULL) {
      printf("libpreview.so open failed: %s\n", dlerror());
      return NULL;
    }
  }

  OpenFunc libpreview_open = (OpenFunc) dlsym(handle, "libpreview_open");
  if (libpreview_open == NULL) {
    printf("libpreview.so dlsym failed: %s\n", dlerror());
    dlclose(handle);
    handle = NULL;
    return NULL;
  }

  // Note: skipping dlclose() since the library is never expected to unload
  return libpreview_open(frameCallback, abandonedCallback, userData);
}

}

#endif
