/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#ifndef OPENCVCAMERARECORDINGPROXY_H

#include <camera/ICameraRecordingProxy.h>

namespace android {

class ICameraRecordingProxyListener;

class OpenCVCameraRecordingProxy : public BnCameraRecordingProxy {
public:
  OpenCVCameraRecordingProxy(const sp<ICameraRecordingProxy>& aProxy);
  virtual status_t startRecording(
    const sp<ICameraRecordingProxyListener>& listener);
  virtual void stopRecording();
  virtual void releaseRecordingFrame(const sp<IMemory>& mem);
private:
  sp<ICameraRecordingProxy> mProxy;
};

};

#endif

