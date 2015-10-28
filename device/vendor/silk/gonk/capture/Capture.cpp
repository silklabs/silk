/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture"
#include <utils/Log.h>

#include <binder/ProcessState.h>
#include <cutils/properties.h>
#include <gui/Surface.h>
#include <gui/SurfaceComposerClient.h>
#include <media/openmax/OMX_IVCommon.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/CameraSource.h>
#include <media/stagefright/MetaData.h>
#include <utils/Thread.h>
#include <sysutils/FrameworkListener.h>

#include "json/json.h"
#include "MPEG4MemoryWriter.h"
#include "Capturedefs.h"
#include "Channel.h"
#include "SlicedMP4Encoder.h"
#include "FaceDetection.h"
#include "OpenCVCameraCapture.h"

using namespace android;
using namespace Json;
using namespace std;

//
// Global variables
//
const char* kMimeTypeAvc = "video/avc";
status_t OK = static_cast<status_t>(android::OK);
Size sVideoSize(1280, 720);
int32_t sVideoBitRateInK = 1024;
int32_t sFPS = 24;
int32_t sIFrameIntervalSec = 15;
int32_t sAudioBitRate = 32000;
int32_t sAudioSampleRate = 8000;
int32_t sAudioChannels = 1;
bool sUseMetaDataMode = true;
sp<OpenCVCameraCapture> sOpenCVCameraCapture = NULL;

//
// Helper macros
//
#define LOG_ERROR(expression, ...) \
  do { \
    if (expression) { \
      ALOGE(__VA_ARGS__); \
      notifyCameraEvent("error"); \
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
class CaptureCommand: public FrameworkCommand,
                      public OpenCVCameraCapture::PreviewProducerListener {
public:
  CaptureCommand(CaptureListener* captureListener, Channel& channel) :
      FrameworkCommand(CAPTURE_COMMAND_NAME),
      mCaptureListener(captureListener),
      mHardwareActive(false),
      mChannel(channel) {
  }

  virtual ~CaptureCommand() {}

  // FrameworkCommand
  int runCommand(SocketClient *c, int argc, char ** argv);

  // OpenCVCameraCapture::PreviewProducerListener
  void onPreviewProducer();

private:
  int capture_init(Value& cmdData);
  int capture_cleanup();
  int capture_setParameter(Value& name, Value& value);
  static void* initThreadWrapper(void* me);
  status_t setPreviewTarget();

  status_t initThread();
  void notifyCameraEvent(const char* eventName);

  CaptureListener* mCaptureListener;
  Reader mJsonReader;
  pthread_t mThread;

  // Camera related
  bool mHardwareActive;
  sp<Camera> mCamera;

  // Faux preview target for when there's no client preview producer around
  sp<SurfaceControl> mPreviewSurfaceControl;

  sp<SlicedMP4Encoder> mMp4;
  sp<MediaSource> mPreview;
  sp<IFrameRequestMonitor> mIframe;
  sp<ALooper> mLooper;
  sp<ICamera> mRemote;
  sp<CameraSource> mCameraSource;
  Channel& mChannel;
  Mutex mPreviewTargetLock;
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
  } else if (cmdName == "setParameter") {
    capture_setParameter(cmdJson["name"], cmdJson["value"]);
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
    notifyCameraEvent("initialized");
    return 0;
  }

  LOG_ERROR((cmdData.isNull()), "init command data is null");

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

  // The default qemu camera HAL does not support metadata mode
  {
    char val[PROPERTY_VALUE_MAX];
    property_get("ro.kernel.qemu", val,  "");
    if (val[0] == '1') {
      ALOGW("qemu detected, disabling frame metadata mode");
      sUseMetaDataMode = false;
    }
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
 * Changes the active preview target for the camera stream
 *
 * This is a little bit involved because we can't:
 * 1. Swap the preview target without pausing the preview stream first.
 * 2. Run the camera without a preview target.
 * 3. Guarantee that node will connect the preview target to us before
 *    requesting that the preview start.
 *
 * (This method may be called by multiple threads)
 */
status_t CaptureCommand::setPreviewTarget() {
  Mutex::Autolock autoLock(mPreviewTargetLock);

  ALOGI("Stopping camera preview");
  mCamera->stopPreview();
  CHECK(!mCamera->previewEnabled());

  sp<IGraphicBufferProducer> previewProducer = sOpenCVCameraCapture->getPreviewProducer();
  if (previewProducer == NULL) {
    ALOGW("No client, selecting null preview target");
    if (mPreviewSurfaceControl == NULL) {
      sp<SurfaceComposerClient> sCClient = new SurfaceComposerClient();
      if (sCClient.get() == NULL) {
        ALOGE("Unable to establish connection to Surface Composer");
        return -1;
      }
      mPreviewSurfaceControl = sCClient->createSurface(String8(CAMERA_NAME),
          0, 0, PIXEL_FORMAT_RGBX_8888, ISurfaceComposerClient::eHidden);
      if (mPreviewSurfaceControl == NULL) {
        ALOGE("Unable to create preview surface");
        return -1;
      }
    }
    previewProducer = mPreviewSurfaceControl->getSurface()->getIGraphicBufferProducer();
  }
  ALOGI("Setting preview target");
  CHECK(mCamera->setPreviewTarget(previewProducer) == 0);
  ALOGI("Starting camera preview");
  CHECK(mCamera->startPreview() == 0);
  CHECK(mCamera->previewEnabled());
  return ::OK;
}


/**
 * Notification when a client preview producer has connected.
 */
void CaptureCommand::onPreviewProducer() {
  CHECK(setPreviewTarget() == 0);
}


/**
 * Thread function that initializes the camera
 */
status_t CaptureCommand::initThread() {
  mLooper = new ALooper;
  mLooper->setName("capture-looper");
  mLooper->start();

  // Setup the camera
  int cameraId = 0;
  mCamera = Camera::connect(cameraId, String16(CAMERA_NAME),
      Camera::USE_CALLING_UID);
  if (mCamera == NULL) {
    ALOGE("Unable to connect to camera");
    return -1;
  }
  mRemote = mCamera->remote();

  FaceDetection faces(&mChannel);
  mCamera->setListener(&faces);

  {
    char previewSize[80];
    snprintf(previewSize, sizeof(previewSize), "%dx%d", sVideoSize.width, sVideoSize.height);
    CameraParameters params = mCamera->getParameters();
    params.set(CameraParameters::KEY_PREVIEW_SIZE, previewSize);
    params.set(CameraParameters::KEY_PREVIEW_FORMAT, "yuv420sp");
    status_t err = mCamera->setParameters(params.flatten());
    CHECK(err == 0);
    params = mCamera->getParameters();
    params.dump();
  }

  sOpenCVCameraCapture->setPreviewProducerListener(this);
  CHECK(setPreviewTarget() == 0);
  CHECK(mCamera->sendCommand(CAMERA_CMD_START_FACE_DETECTION, CAMERA_FACE_DETECTION_SW, 0) == 0);

  // Start recording stream
  mCameraSource = CameraSource::CreateFromCamera(mRemote, mCamera->getRecordingProxy(), cameraId,
      String16(CAMERA_NAME, strlen(CAMERA_NAME)), Camera::USE_CALLING_UID,
      sVideoSize, sFPS,
      NULL, sUseMetaDataMode);
  CHECK_EQ(mCameraSource->initCheck(), ::OK);

  mMp4 = new SlicedMP4Encoder(mLooper, &mChannel, mCameraSource);
  mMp4->run();

  mIframe = new IFrameRequestMonitor(mMp4->videoEncoder());

  // Notify node that camera is initialized
  notifyCameraEvent("initialized");
  mHardwareActive = true;

  // Block this thread while camera is running
  mMp4->join();

  sOpenCVCameraCapture->setPreviewProducerListener(NULL);
  return 0;
}

/**
 * Clean up and stop camera module
 */
int CaptureCommand::capture_cleanup() {
  if (mHardwareActive) {
    mCamera->stopPreview();

    // Close camera
    if (NULL != mCamera.get()) {
      mCamera->disconnect();
      mCamera.clear();
    }
  }
  mHardwareActive = false;
  notifyCameraEvent("stopped");

  return 0;
}

/**
 * Set a camera parameter
 */
int CaptureCommand::capture_setParameter(Value& name, Value& value) {
  LOG_ERROR((name.isNull()), "name not specified");
  LOG_ERROR((value.isNull()), "value not specified");
  LOG_ERROR((mCamera.get() == NULL), "camera not initialized");

  CameraParameters params = mCamera->getParameters();
  params.set(name.asCString(), value.asCString());
  status_t err = mCamera->setParameters(params.flatten());
  if (err != ::OK) {
    ALOGW("Error %d: Failed to set '%s' to '%s'", err,
      name.asCString(), value.asCString());
  }
  return 0;
}

/**
 * Notify camera node module of the requested event specified by eventName
 */
void CaptureCommand::notifyCameraEvent(const char* eventName) {
  Value jsonMsg;
  jsonMsg["eventName"] = eventName;
  mCaptureListener->sendEvent(jsonMsg);
}

/**
 * Entry point into the capture service
 */
int main(int argc, char **argv) {
  (void) argc;
  (void) argv;

  status_t err;

  sp<ProcessState> proc(ProcessState::self());
  ProcessState::self()->startThreadPool();

  sOpenCVCameraCapture = new OpenCVCameraCapture();
  err = sOpenCVCameraCapture->publish();
  if (err != 0) {
    ALOGE("Unable to publish OpenCVCameraCapture service: %d", err);
    return 1;
  }

  // Start the data socket that would be used to stream camera frames to the
  // camera node module
  Channel channel;
  err = channel.startListener();
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
