/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
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

bool open(FrameCallback frameCallback, void *userData);
void close();

// Each frameBuffer passed to FrameCallback must be released using
// releaseFrame() without exceeding MAX_UNLOCKED_FRAMEBUFFERS worth of
// unreleased buffers.
void releaseFrame(void *frameBuffer);


// libpreview::load() can be used to load the library dynamically.  This is
// usefull when the caller uses an exotic STL, such as gnu_static and can't link
// directly to libpreview.so
typedef struct {
  bool (*open)(FrameCallback frameCallback, void *userData);
  void (*close)();

  // Each frameBuffer passed to FrameCallback must be released using
  // releaseFrame() without exceeding MAX_UNLOCKED_FRAMEBUFFERS worth of
  // unreleased buffers.
  void (*releaseFrame)(void *frameBuffer);
} vtable;

static __inline bool load(vtable *vtable) {
  void *handle = dlopen("/system/silk/lib/libpreview.so", RTLD_NOW);
  if (handle == NULL) {
    ALOGE("libpreview.so open failed: %s\n", dlerror());
    return false;
  }

  vtable->open = NULL;
  vtable->close = NULL;
  vtable->releaseFrame = NULL;

  *(size_t *) &vtable->open = (size_t) dlsym(handle, "_ZN10libpreview4openEPFvPvS0_NS_11FrameFormatEjjES0_");
  if (vtable->open != NULL) {
    *(size_t *) &vtable->close = (size_t) dlsym(handle, "_ZN10libpreview5closeEv");
  }
  if (vtable->close != NULL) {
    *(size_t *) &vtable->releaseFrame = (size_t) dlsym(handle, "_ZN10libpreview12releaseFrameEPv");
  }

  if (vtable->releaseFrame == NULL) {
    ALOGE("libpreview.so dlsym failed: %s\n", dlerror());
    return false;
  }

  // Note: skipping dlclose() since the library is never expected to unload
  return true;
}

}

#endif
