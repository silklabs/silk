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

#define LIBPREVIEW_OPEN_MANGLED "_ZN10libpreview4openEPFvPvS0_NS_11FrameFormatEjjEPFvS0_ES0_"
bool open(FrameCallback frameCallback,
          AbandonedCallback frameAbandonedCallback,
          void *userData);

#define LIBPREVIEW_CLOSE_MANGLED "_ZN10libpreview5closeEv"
void close();

// Each frameBuffer passed to FrameCallback must be released using
// releaseFrame() without exceeding MAX_UNLOCKED_FRAMEBUFFERS worth of
// unreleased buffers.
// If AbandonedCallback is invoked, then any unreleased frameBuffers should
// no longer be used as they are now invalid.
#define LIBPREVIEW_RELEASEFRAME_MANGLED "_ZN10libpreview12releaseFrameEPv"
void releaseFrame(void *frameBuffer);

// libpreview::load() can be used to load the library dynamically.  This is
// usefull when the caller uses an exotic STL, such as gnu_static and can't link
// directly to libpreview.so
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


// libpreview is loaded dynamically to avoid STL linkage assumptions between
// libpreview and its users
static __inline vtable const *load() {
  static void *handle = NULL;
  static vtable vt = {NULL, NULL, NULL};

  if (handle != NULL) {
    return &vt;
  }

  if (handle == NULL) {
    handle = dlopen("/system/silk/lib/libpreview.so", RTLD_NOW);
  }
  if (handle == NULL) {
    ALOGE("libpreview.so open failed: %s\n", dlerror());
    return NULL;
  }

  *(size_t *) &vt.open = (size_t) dlsym(handle, LIBPREVIEW_OPEN_MANGLED);
  if (vt.open != NULL) {
    *(size_t *) &vt.close = (size_t) dlsym(handle, LIBPREVIEW_CLOSE_MANGLED);
  }
  if (vt.close != NULL) {
    *(size_t *) &vt.releaseFrame = (size_t) dlsym(handle, LIBPREVIEW_RELEASEFRAME_MANGLED);
  }

  if (vt.releaseFrame == NULL) {
    ALOGE("libpreview.so dlsym failed: %s\n", dlerror());
    dlclose(handle);
    handle = NULL;
    return NULL;
  }

  // Note: skipping dlclose() since the library is never expected to unload
  return &vt;
}

}

#endif
