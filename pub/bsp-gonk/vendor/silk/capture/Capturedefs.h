#ifndef CAPTUREDEFS_H_
#define CAPTUREDEFS_H_

#include <utils/Errors.h>
#include <camera/CameraParameters.h>

using namespace android;

//
// Constants
//

#define CAPTURE_CTL_SOCKET_NAME "capturectl"
#define CAPTURE_DATA_SOCKET_NAME "captured"
#define CAPTURE_COMMAND_NAME "CaptureCommand"

#define MAX_MSG_SIZE 128
#define CAMERA_NAME "capture"

//
// Global variables
//
extern const char* kMimeTypeAvc;
extern status_t OK;
extern Size sVideoSize;
extern int32_t sVideoBitRateInK;
extern int32_t sFPS;
extern int32_t sIFrameIntervalMs;
extern int32_t sAudioBitRate;
extern int32_t sAudioSampleRate;
extern int32_t sAudioChannels;
extern bool sAudioMute;
extern bool sUseMetaDataMode;

#endif
