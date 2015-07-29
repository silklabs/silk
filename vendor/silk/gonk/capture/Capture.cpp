/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture"
#include <utils/Log.h>

#include <binder/ProcessState.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/CameraSource.h>
#include <media/stagefright/MetaData.h>
#include <gui/Surface.h>
#include <gui/SurfaceComposerClient.h>
#include <utils/Thread.h>
#include <sysutils/FrameworkListener.h>

#include "json/json.h"
#include "MPEG4MemoryWriter.h"
#include "Capturedefs.h"
#include "Channel.h"
#include "PreviewMediaSource.h"
#include "SlicedMP4Encoder.h"
#include "FaceDetection.h"

using namespace android;
using namespace Json;
using namespace std;

//
// Global variables
//
const char* kMimeTypeAvc = "video/avc";
status_t OK = static_cast<status_t>(android::OK);
bool sDebug = false;
Size sVideoSize(1280, 720);
int32_t sVideoBitRateInK = 1024;
int32_t sFPS = 24;
int32_t sIFrameIntervalSec = 15;
int32_t sPreviewScale = 4;
int32_t sPreviewSkipCount = 5;
int32_t sAudioBitRate = 32000;
int32_t sAudioSampleRate = 8000;
int32_t sAudioChannels = 1;

//
// Helper macros
//
#define LOG_ERROR(expression, ...) \
  do { \
    if (expression) { \
      ALOGE(__VA_ARGS__); \
      Value jsonMsg; \
      jsonMsg["eventName"] = "error"; \
      mCaptureListener->sendEvent(jsonMsg); \
      return 1; \
    } \
  } while(0)

//
// Forward declarations
//
class CaptureListener;

/**
 *
 */
class IFrameRequestMonitor: public Thread {
  sp<MediaCodecSource> mEncoder;
public:
  IFrameRequestMonitor(sp<MediaCodecSource> encoder) :
      mEncoder(encoder) {
  }

  virtual bool threadLoop() {
    while (true) {
      char b;
      // Any data from the pipe causes us to inject an I-Frame.
      read(STDIN_FILENO, &b, 1);
      mEncoder->requestIDRFrame();
    }
    return true;
  }
};

/**
 * This class provided a method that is run each time
 * {@code CAPTURE_COMMAND_NAME} is received from node over the socket
 */
class CaptureCommand: public FrameworkCommand {
public:
  CaptureCommand(CaptureListener* captureListener, Channel& channel) :
      FrameworkCommand(CAPTURE_COMMAND_NAME),
      mCaptureListener(captureListener),
      mHardwareActive(false),
      mChannel(channel) {
  }

  virtual ~CaptureCommand() {}
  int runCommand(SocketClient *c, int argc, char ** argv);

private:
  int capture_init(Value& cmdData);
  int capture_cleanup();
  static void* initThreadWrapper(void* me);
  status_t initThread();

  CaptureListener* mCaptureListener;
  Reader mJsonReader;
  pthread_t mThread;

  // Camera related
  bool mHardwareActive;
  sp<Camera> mCamera;
  sp<SurfaceControl> mSurfaceControl;
  sp<Surface> mPreviewSurface;
  sp<SurfaceComposerClient> mSCClient;
  sp<SlicedMP4Encoder> mMp4;
  sp<MediaSource> mPreview;
  sp<IFrameRequestMonitor> mIframe;
  sp<ALooper> mLooper;
  sp<ICamera> mRemote;
  sp<ICameraRecordingProxy> mProxy;
  sp<CameraSource> mCameraSource;
  Channel& mChannel;
};

/**
 * This class provides a wrapper around capture socket to help with
 * sending and receiving messages using the capture socket.
 */
class CaptureListener: private FrameworkListener {
public:
  CaptureListener(Channel& channel) :
      FrameworkListener(CAPTURE_CTL_SOCKET_NAME) {
    FrameworkListener::registerCmd(new CaptureCommand(this, channel));
  }

  int start() {
    ALOGD("Starting CaptureListener");
    return FrameworkListener::startListener();
  }

  /**
   * Notify the client of a capture event
   */
  void sendEvent(const Value & jsonMsg) {
    FastWriter fastWriter;
    string jsonMessage = fastWriter.write(jsonMsg);

    ALOGV("Broadcasting %s", jsonMessage.c_str());
    FrameworkListener::sendBroadcast(200, jsonMessage.c_str(), false);
  }
};

/**
 * This function is run when a capture command is received from the client
 */
int CaptureCommand::runCommand(SocketClient *c, int argc, char ** argv) {
  char *saveptr;

  char *cmd = strtok_r(argv[1], " \n", &saveptr);
  if (!cmd) {
    return 1;
  }

  ALOGV("Received command: %s", cmd);

  // Parse JSON command
  Value cmdJson;
  bool result = mJsonReader.parse(cmd, cmdJson, false);
  LOG_ERROR((result != true), "Failed to parse command: %s",
      mJsonReader.getFormattedErrorMessages().c_str());

  // Get command name
  Value cmdNameVal = cmdJson["cmdName"];
  LOG_ERROR((cmdNameVal.isNull()), "cmdName not available");

  string cmdName = cmdNameVal.asString();
  if (cmdName == "init") {
    capture_init(cmdJson["cmdData"]);
  } else if (cmdName == "stop") {
    capture_cleanup();
  } else {
    LOG_ERROR(true, "Invalid command %s", cmdName.c_str());
  }

  return 0;
}

/**
 * Initialize camera and start sending frames to node
 */
int CaptureCommand::capture_init(Value& cmdData) {
  ALOGV("%s", __FUNCTION__);

  // Check if hardware is already initialized
  if (mHardwareActive) {
    return 0;
  }

  if (!cmdData["width"].isNull()) {
    sVideoSize.width = cmdData["width"].asInt();
    ALOGV("sVideoSize.width %d", sVideoSize.width);
  }
  if (!cmdData["height"].isNull()) {
    sVideoSize.height = cmdData["height"].asInt();
    ALOGV("sVideoSize.height %d", sVideoSize.height);
  }
  if (!cmdData["vbr"].isNull()) {
    sVideoBitRateInK = cmdData["vbr"].asInt();
    ALOGV("sVideoBitRateInK %d", sVideoBitRateInK);
  }
  if (!cmdData["fps"].isNull()) {
    sFPS = cmdData["fps"].asInt();
    ALOGV("sFPS %d", sFPS);
  }
  if (!cmdData["frameInterval"].isNull()) {
    sIFrameIntervalSec = cmdData["frameInterval"].asInt();
    ALOGV("sIFrameIntervalSec %d", sIFrameIntervalSec);
  }
  if (!cmdData["previewScale"].isNull()) {
    sPreviewScale = cmdData["previewScale"].asInt();
    ALOGV("sPreviewScale %d", sPreviewScale);
  }
  if (!cmdData["previewSkipCount"].isNull()) {
    sPreviewSkipCount = cmdData["previewSkipCount"].asInt();
    ALOGV("sFsPreviewSkipCount %d", sPreviewSkipCount);
  }
  if (!cmdData["audioBitRate"].isNull()) {
    sAudioBitRate = cmdData["audioBitRate"].asInt();
    ALOGV("sAudioBitRate %d", sAudioBitRate);
  }
  if (!cmdData["audioSampleRate"].isNull()) {
    sAudioSampleRate = cmdData["audioSampleRate"].asInt();
    ALOGV("sAudioSampleRate %d", sAudioSampleRate);
  }
  if (!cmdData["audioChannels"].isNull()) {
    sAudioChannels = cmdData["audioChannels"].asInt();
    ALOGV("sAudioChannels %d", sAudioChannels);
  }
  if (!cmdData["debug"].isNull()) {
    sDebug = cmdData["debug"].asInt();
    ALOGV("sDebug %d", sDebug);
  }

  // Start camera in a separate thread
  pthread_create(&mThread, NULL, initThreadWrapper, this);
  return 0;
}

/**
 * Helper function
 */
void* CaptureCommand::initThreadWrapper(void* me) {
  CaptureCommand* command = static_cast<CaptureCommand *>(me);
  command->initThread();
  return NULL;
}

/**
 * Thread function that initializes the camera
 */
status_t CaptureCommand::initThread() {
  mLooper = new ALooper;
  mLooper->setName("capture-looper");
  mLooper->start();

  // Create a preview surface
  mSCClient = new SurfaceComposerClient();
  if (mSCClient.get() == NULL) {
    ALOGE("Unable to establish connection to Surface Composer");
    return -1;
  }
  mSurfaceControl = mSCClient->createSurface(String8(CAMERA_NAME),
      sVideoSize.width, sVideoSize.height, PIXEL_FORMAT_RGBX_8888, 0);
  if (mSurfaceControl.get() == NULL) {
    ALOGE("Unable to create preview surface");
    return -1;
  }
  mPreviewSurface = mSurfaceControl->getSurface();

  // Setup the camera
  int cameraId = 0;
  mCamera = Camera::connect(cameraId, String16(CAMERA_NAME),
      Camera::USE_CALLING_UID);
  if (mCamera == NULL) {
    ALOGE("Unable to connect to camera");
    return -1;
  }
  mRemote = mCamera->remote();
  mProxy = mCamera->getRecordingProxy();

  FaceDetection faces(&mChannel);
  mCamera->setListener(&faces);

  CHECK(mCamera->setPreviewTarget(mPreviewSurface->getIGraphicBufferProducer()) == 0);
  CHECK(mCamera->startPreview() == 0);
  CHECK(mCamera->previewEnabled());
  CHECK(mCamera->sendCommand(CAMERA_CMD_START_FACE_DETECTION, CAMERA_FACE_DETECTION_SW, 0) == 0);

  // Start recording stream
  mCameraSource = CameraSource::CreateFromCamera(mRemote, mProxy, cameraId,
      String16(CAMERA_NAME, strlen(CAMERA_NAME)), Camera::USE_CALLING_UID,
      sVideoSize, sFPS,
      NULL);
  CHECK_EQ(mCameraSource->initCheck(), ::OK);

  sp<ProcessState> proc(ProcessState::self());
  ProcessState::self()->startThreadPool();

  mPreview = new PreviewMediaSource(&mChannel, mCameraSource, sPreviewSkipCount);
  mMp4 = new SlicedMP4Encoder(mLooper, &mChannel, mPreview);
  mMp4->run();

  mIframe = new IFrameRequestMonitor(mMp4->videoEncoder());

  mHardwareActive = true;

  // Block this thread while camera is running
  mMp4->join();

  return 0;
}

/**
 * Clean up and stop camera module
 */
int CaptureCommand::capture_cleanup() {
  if (mHardwareActive) {
    mCamera->stopPreview();

    /* Destroy preview surface */
    if (NULL != mPreviewSurface.get()) {
      mPreviewSurface.clear();
    }

    if (NULL != mSurfaceControl.get()) {
      mSurfaceControl->clear();
      mSurfaceControl.clear();
    }

    if (NULL != mSCClient.get()) {
      mSCClient->dispose();
      mSCClient.clear();
    }

    // Close camera
    if (NULL != mCamera.get()) {
      mCamera->disconnect();
      mCamera.clear();
    }
  }
  mHardwareActive = false;
  return 0;
}

/**
 * Entry point into the capture service
 */
int main(int argc, char **argv) {
  (void) argc;
  (void) argv;

  // Start the data socket that would be used to stream camera frames to the
  // camera node module
  Channel channel;
  int err = channel.startListener();
  if (err < 0) {
    ALOGE("Failed to start capture data socket listener: %d\n", err);
    return 1;
  }

  // Start the control socket and register for commands from camera node module
  CaptureListener captureListener(channel);
  err = captureListener.start();
  if (err < 0) {
    ALOGE("Failed to start capture ctl socket listener: %d\n", err);
    Value jsonMsg;
    jsonMsg["eventName"] = "error";
    captureListener.sendEvent(jsonMsg);
    return 1;
  }

  while (1) {
    sleep(INT_MAX);
  }

  return 0;
}
