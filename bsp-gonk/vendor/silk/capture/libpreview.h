#ifndef LIBPREVIEW_H
#define LIBPREVIEW_H

#include <dlfcn.h>

namespace libpreview {

// Max number of active frameBuffers without stalling the preview pipeline.
#define MAX_UNLOCKED_FRAMEBUFFERS 1

typedef enum {
  FRAMEFORMAT_INVALID,
  FRAMEFORMAT_RGB,
  FRAMEFORMAT_YVU420SP,
} FrameFormat;

typedef void (*FrameCallback)(void *userData, void *frameBuffer, FrameFormat format,
                              size_t width, size_t height);
typedef void (*AbandonedCallback)(void *userData);

typedef struct {
  bool (*open)(FrameCallback frameCallback,
               AbandonedCallback frameAbandonedCallback,
               void *userData);
  void (*close)();

  // Each frameBuffer passed to FrameCallback must be released using
  // releaseFrame() without exceeding MAX_UNLOCKED_FRAMEBUFFERS worth of
  // unreleased buffers.
  void (*releaseFrame)(void *frameBuffer);
} vtable;

static __inline const vtable *load() {
  static void *handle = NULL;

  if (handle == NULL) {
    handle = dlopen("/system/silk/lib/libpreview.so", RTLD_NOW);
    if (handle == NULL) {
      ALOGE("libpreview.so open failed: %s\n", dlerror());
      return NULL;
    }
  }

  vtable *vt = (vtable *) dlsym(handle, "vtable");
  if (vt == NULL) {
    ALOGE("libpreview.so dlsym failed: %s\n", dlerror());
    dlclose(handle);
    handle = NULL;
    return NULL;
  }

  // Note: skipping dlclose() since the library is never expected to unload
  return vt;
}

}

#endif
