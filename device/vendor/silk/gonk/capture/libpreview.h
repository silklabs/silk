/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#ifndef LIBPREVIEW_H
#define LIBPREVIEW_H

namespace libpreview {

// Max number of active frameBuffers without stalling the preview pipeline.
//
#define MAX_UNLOCKED_FRAMEBUFFERS 1

typedef enum {
  FRAMEFORMAT_INVALID,
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

}

#endif
