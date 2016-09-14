/*
 *  Copyright (c) 2012 The WebRTC project authors. All Rights Reserved.
 *  Copyright (c) 2016 Silk Labs, Inc. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#ifndef WEBRTC_MODULES_VIDEO_CAPTURE_MAIN_SOURCE_GONK_VIDEO_CAPTURE_GONK_H_
#define WEBRTC_MODULES_VIDEO_CAPTURE_MAIN_SOURCE_GONK_VIDEO_CAPTURE_GONK_H_

#include "webrtc/modules/video_capture/video_capture_impl.h"

#define LOG_TAG "video_capture_gonk"
#include <utils/Log.h>
#include "libpreview.h"

namespace webrtc
{
class CriticalSectionWrapper;
namespace videocapturemodule
{

class VideoCaptureModuleGonk: public VideoCaptureImpl
{
public:
    VideoCaptureModuleGonk(int32_t id);
    virtual ~VideoCaptureModuleGonk();
    virtual int32_t Init(const char* deviceUniqueId);
    virtual int32_t StartCapture(const VideoCaptureCapability& capability);
    virtual int32_t StopCapture();
    virtual bool CaptureStarted();
    virtual int32_t CaptureSettings(VideoCaptureCapability& settings);

private:
    static void OnAbandonedCallback(void *userData);
    static void OnFrameCallback(void *userData,
                                void* buffer,
                                libpreview::FrameFormat format,
                                size_t width,
                                size_t height,
                                libpreview::FrameOwner frameOwner);

    CriticalSectionWrapper* _captureCritSect;
    libpreview::Client *_client;

    int32_t _currentWidth;
    int32_t _currentHeight;
    int32_t _currentFrameRate;
    int32_t _currentFrameIntervalMs;
    int64_t _lastFrameMs;
    bool _captureStarted;
    RawVideoType _captureVideoType;
};
}  // namespace videocapturemodule
}  // namespace webrtc

#endif // WEBRTC_MODULES_VIDEO_CAPTURE_MAIN_SOURCE_GONK_VIDEO_CAPTURE_GONK_H_
