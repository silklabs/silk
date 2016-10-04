#ifndef LIBPREVIEW_H
#define LIBPREVIEW_H

#include <dlfcn.h>

namespace libpreview {

// Max number of locked frame without stalling the preview pipeline.
#define MAX_UNLOCKED_FRAMES 2

typedef enum {
  FRAMEFORMAT_INVALID,
  FRAMEFORMAT_RGB,
  FRAMEFORMAT_YVU420SP,
} FrameFormat;

typedef void *FrameOwner;

class Client {
public:
  virtual ~Client() = 0;
  virtual void releaseFrame(FrameOwner owner) = 0;
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
    handle = dlopen("/system/silk/lib/libpreview.so", RTLD_NOW);
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
