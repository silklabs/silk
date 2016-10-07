//#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture"
#include <utils/Log.h>

#include <binder/IServiceManager.h>
#include <binder/ProcessState.h>
#include <cutils/properties.h>
#include <gui/Surface.h>
#include <gui/SurfaceComposerClient.h>
#include <media/openmax/OMX_IVCommon.h>
#include <media/stagefright/AudioSource.h>
#include <media/stagefright/CameraSource.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/foundation/AMessage.h>
#include <media/stagefright/MediaDefs.h>
#include <media/stagefright/MetaData.h>
#include <media/stagefright/OMXCodec.h>
#include <system/audio.h>
#include <utils/Thread.h>

#include "AudioSourceEmitter.h"
#include "AudioMutter.h"
#include "json/json.h"
#include "Capturedefs.h"
#include "Channel.h"
#include "FaceDetection.h"
#include "MPEG4SegmenterDASH.h"
#include "OpenCVCameraCapture.h"
#include "FrameworkListener1.h"

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
int32_t sIFrameIntervalMs = 1000;
int32_t sAudioBitRate = 32000;
int32_t sAudioSampleRate = 8000;
int32_t sAudioChannels = 1;
bool sInitAudio = true;
bool sInitCameraFrames = true;
bool sInitCameraVideo = true;
bool sAudioMute = false;
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
 * This class provided a method that is run each time
 * {@code CAPTURE_COMMAND_NAME} is received from node over the socket
 */
class CaptureCommand: public FrameworkCommand,
                      public OpenCVCameraCapture::PreviewProducerListener {
public:
  CaptureCommand(CaptureListener* captureListener,
                 Channel& micChannel,
                 Channel& vidChannel) :
      FrameworkCommand(CAPTURE_COMMAND_NAME),
      mCaptureListener(captureListener),
      mHardwareActive(false),
      mMicChannel(micChannel),
      mVidChannel(vidChannel) {
  }

  virtual ~CaptureCommand() {}

  // FrameworkCommand
  int runCommand(SocketClient *c, int argc, char ** argv);

  // OpenCVCameraCapture::PreviewProducerListener
  void onPreviewProducer();

private:
  int capture_init(Value& cmdData);
  int capture_update(Value& cmdData);
  int capture_cleanup();
  int capture_setParameter(Value& name, Value& value);
  int capture_getParameterInt(Value& name);
  int capture_getParameterStr(Value& name);
  static void* initThreadCameraWrapper(void* me);
  static void* initThreadAudioOnlyWrapper(void* me);
  status_t setPreviewTarget();

  status_t initThreadCamera();
  status_t initThreadAudioOnly();
  void notifyCameraEvent(const char* eventName);

  CaptureListener* mCaptureListener;
  Reader mJsonReader;
  pthread_t mCameraThread;
  pthread_t mAudioThread;

  // Camera related
  bool mHardwareActive;
  sp<Camera> mCamera;

  // Faux preview target for when there's no client preview producer around
  sp<SurfaceControl> mPreviewSurfaceControl;

  sp<MPEG4SegmenterDASH> mSegmenter;
  sp<MediaSource> mPreview;
  sp<ALooper> mLooper;
  sp<ICamera> mRemote;
  sp<CameraSource> mCameraSource;
  Channel& mMicChannel;
  Channel& mVidChannel;
  Mutex mPreviewTargetLock;
};

/**
 * This class provides a wrapper around capture socket to help with
 * sending and receiving messages using the capture socket.
 */
class CaptureListener: private FrameworkListener1 {
public:
  CaptureListener(Channel& micChannel, Channel& vidChannel)
      : FrameworkListener1(CAPTURE_CTL_SOCKET_NAME) {
    FrameworkListener1::registerCmd(
      new CaptureCommand(this, micChannel, vidChannel));
  }

  int start() {
    ALOGD("Starting CaptureListener");
    return FrameworkListener1::startListener();
  }

  /**
   * Notify the client of a capture event
   */
  void sendEvent(const Value & jsonMsg) {
    FastWriter fastWriter;
    string jsonMessage = fastWriter.write(jsonMsg);

    ALOGV("Broadcasting %s", jsonMessage.c_str());
    FrameworkListener1::sendBroadcast(200, jsonMessage.c_str(), false);
  }
};

/**
 * This function is run when a capture command is received from the client
 */
int CaptureCommand::runCommand(SocketClient *c, int argc, char ** argv) {
  ALOGD("Received command %s", argv[0]);

  // Parse JSON command
  Value cmdJson;
  bool result = mJsonReader.parse(argv[0], cmdJson, false);
  LOG_ERROR((result != true), "Failed to parse command: %s",
      mJsonReader.getFormattedErrorMessages().c_str());

  // Get command name
  Value cmdNameVal = cmdJson["cmdName"];
  LOG_ERROR((cmdNameVal.isNull()), "cmdName not available");

  string cmdName = cmdNameVal.asString();
  if (cmdName == "init") {
    capture_init(cmdJson["cmdData"]);
  } else if (cmdName == "update") {
    capture_update(cmdJson["cmdData"]);
  } else if (cmdName == "stop") {
    capture_cleanup();
  } else if (cmdName == "setParameter") {
    capture_setParameter(cmdJson["name"], cmdJson["value"]);
  } else if (cmdName == "getParameterInt") {
    capture_getParameterInt(cmdJson["name"]);
  } else if (cmdName == "getParameterStr") {
    capture_getParameterStr(cmdJson["name"]);
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
    ALOGW("Hardware already initialized, ignoring request");
    notifyCameraEvent("initialized");
    return 0;
  }

  LOG_ERROR((cmdData.isNull()), "init command data is null");

  if (!cmdData["audio"].isNull()) {
    sInitAudio = cmdData["audio"].asBool();
    ALOGV("sInitAudio %d", sInitAudio);
  }

  if (!cmdData["frames"].isNull()) {
    sInitCameraFrames = cmdData["frames"].asBool();
    ALOGV("sInitCameraFrames %d", sInitCameraFrames);
    if (sInitCameraFrames) {
      LOG_ERROR(!sInitAudio, "Must init audio for camera frames"); // TODO: Relax this
    }
  }

  if (!cmdData["video"].isNull()) {
    sInitCameraVideo = cmdData["video"].asBool();
    ALOGV("sInitCameraVideo %d", sInitCameraVideo);
    if (sInitCameraVideo) {
      LOG_ERROR(!sInitCameraFrames,
        "Must init camera frames for camera video"); // TODO: Relax this
    }
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
  if (!cmdData["frameIntervalMs"].isNull()) {
    sIFrameIntervalMs = cmdData["frameIntervalMs"].asInt();
    ALOGV("sIFrameIntervalSec %d", sIFrameIntervalMs);
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

  // Now update the run-time configurable parameters
  capture_update(cmdData);

  // The default qemu camera HAL does not support metadata mode
  {
    char val[PROPERTY_VALUE_MAX];
    property_get("ro.kernel.qemu", val,  "");
    if (val[0] == '1') {
      ALOGW("qemu detected, disabling frame metadata mode");
      sUseMetaDataMode = false;
    }
  }

  if (sInitCameraFrames) {
    pthread_create(&mCameraThread, NULL, initThreadCameraWrapper, this);
  } else if (sInitAudio) {
    pthread_create(&mAudioThread, NULL, initThreadAudioOnlyWrapper, this);
  } else {
    ALOGW("Neither camera nor audio requested, initialized nothing.");
    mHardwareActive = true;
    notifyCameraEvent("initialized");
  }

  return 0;
}


/**
 * Update run-time configurable parameters
 */
int CaptureCommand::capture_update(Value& cmdData) {
  ALOGV("%s", __FUNCTION__);

  LOG_ERROR((cmdData.isNull()), "update command data is null");

  if (!cmdData["audioMute"].isNull()) {
    sAudioMute = cmdData["audioMute"].asBool();
    ALOGV("sAudioMute %d", sAudioMute);
  }
  return 0;
}

void* CaptureCommand::initThreadCameraWrapper(void* me) {
  CaptureCommand* command = static_cast<CaptureCommand *>(me);
  command->initThreadCamera();
  return NULL;
}

void* CaptureCommand::initThreadAudioOnlyWrapper(void* me) {
  CaptureCommand* command = static_cast<CaptureCommand *>(me);
  command->initThreadAudioOnly();
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

sp<MediaSource> prepareVideoEncoder(const sp<ALooper>& looper,
                                    const sp<MediaSource>& source) {
  sp<MetaData> meta = source->getFormat();
  int32_t width, height, stride, sliceHeight, colorFormat;
  CHECK(meta->findInt32(kKeyWidth, &width));
  CHECK(meta->findInt32(kKeyHeight, &height));
  CHECK(meta->findInt32(kKeyStride, &stride));
  CHECK(meta->findInt32(kKeySliceHeight, &sliceHeight));
  CHECK(meta->findInt32(kKeyColorFormat, &colorFormat));

  sp<AMessage> format = new AMessage();
  format->setInt32("width", width);
  format->setInt32("height", height);
  format->setInt32("stride", stride);
  format->setInt32("slice-height", sliceHeight);
  format->setInt32("color-format", colorFormat);

  format->setString("mime", kMimeTypeAvc);
  format->setInt32("bitrate", sVideoBitRateInK * 1024);
  format->setInt32("bitrate-mode", OMX_Video_ControlRateVariable);
  format->setFloat("frame-rate", sFPS);
  format->setInt32("i-frame-interval-ms", sIFrameIntervalMs);

  return MediaCodecSource::Create(
    looper,
    format,
    source,
#ifdef TARGET_GE_MARSHMALLOW
    NULL,
#endif
    sUseMetaDataMode ? MediaCodecSource::FLAG_USE_METADATA_INPUT : 0
  );
}

sp<MediaSource> prepareAudioEncoder(const sp<ALooper>& looper,
                                    const sp<MediaSource>& source) {
  sp<MetaData> meta = source->getFormat();
  int32_t maxInputSize, channels, sampleRate, bitrate;
  CHECK(meta->findInt32(kKeyMaxInputSize, &maxInputSize));
  CHECK(meta->findInt32(kKeySampleRate, &sampleRate));
  CHECK(meta->findInt32(kKeyChannelCount, &channels));

  sp<AMessage> format = new AMessage();
  format->setString("mime", MEDIA_MIMETYPE_AUDIO_AAC);
  format->setInt32("aac-profile", OMX_AUDIO_AACObjectLC);
  format->setInt32("max-input-size", maxInputSize);
  format->setInt32("sample-rate", sampleRate);
  format->setInt32("channel-count", channels);
  format->setInt32("bitrate", sAudioBitRate);

  return MediaCodecSource::Create(looper, format, source);
}


class MediaSourceNullPuller {
public:
  MediaSourceNullPuller(sp<MediaSource> source, const char *name) :
    mMediaSource(source), mName(name) {};

  bool loop() {
    for (;;) {
      MediaBuffer *buffer;
      status_t err = mMediaSource->read(&buffer);
      if (err != ::OK) {
        ALOGE("Error reading from %s source: %d", mName, err);
        return false;
      }

      if (buffer == NULL) {
        ALOGE("Failed to get buffer from %s source", mName);
        return false;
      }
      buffer->release();
    }
    return true;
  };

private:
  sp<MediaSource> mMediaSource;
  const char *mName;
};


/**
 * Thread function that initializes audio output only
 */
status_t CaptureCommand::initThreadAudioOnly() {

  sp<MediaSource> audioSource(
    new AudioSource(
      AUDIO_SOURCE_MIC,
#ifdef TARGET_GE_MARSHMALLOW
      String16("silk-capture"),
#endif
      sAudioSampleRate,
      sAudioChannels
    )
  );
  sp<MediaSource> audioSourceEmitter =
    new AudioSourceEmitter(audioSource, &mMicChannel,
                           sAudioSampleRate, sAudioChannels);
  sp<MediaSource> audioMutter =
    new AudioMutter(audioSourceEmitter);

  // Notify that audio is initialized
  notifyCameraEvent("initialized");
  mHardwareActive = true;

  // Start the audio source and pull out buffers as fast as they come.  The
  // TAG_MIC data will will sent as a side effect
  CHECK_EQ(audioMutter->start(), ::OK);
  MediaSourceNullPuller audioPuller(audioMutter, "audio");
  if (!audioPuller.loop()) {
    notifyCameraEvent("error");
  }
  return 0;
}

/**
 * Thread function that initializes the camera
 */
status_t CaptureCommand::initThreadCamera() {
  // Setup the camera
  int cameraId = 0;
  mCamera = Camera::connect(cameraId, String16(CAMERA_NAME),
      Camera::USE_CALLING_UID);
  if (mCamera == NULL) {
    ALOGE("Unable to connect to camera");
    return -1;
  }
  mRemote = mCamera->remote();

  FaceDetection faces(&mVidChannel);
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

  //CHECK(mCamera->sendCommand(CAMERA_CMD_START_FACE_DETECTION, CAMERA_FACE_DETECTION_SW, 0) == 0);
  CHECK(mCamera->sendCommand(CAMERA_CMD_ENABLE_FOCUS_MOVE_MSG, 1, 0) == 0);

  mCameraSource = CameraSource::CreateFromCamera(mRemote, mCamera->getRecordingProxy(), cameraId,
      String16(CAMERA_NAME, strlen(CAMERA_NAME)), Camera::USE_CALLING_UID,
      sVideoSize, sFPS,
      NULL, sUseMetaDataMode);
  CHECK_EQ(mCameraSource->initCheck(), ::OK);

  if (sInitCameraVideo) {
    mLooper = new ALooper;
    mLooper->setName("capture-looper");
    mLooper->start();

    sp<MediaSource> videoEncoder = prepareVideoEncoder(mLooper, mCameraSource);

    sp<MediaSource> audioSource(
      new AudioSource(
        AUDIO_SOURCE_MIC,
#ifdef TARGET_GE_MARSHMALLOW
        String16("silk-capture"),
#endif
        sAudioSampleRate,
        sAudioChannels
      )
    );
    sp<MediaSource> audioSourceEmitter =
      new AudioSourceEmitter(audioSource, &mMicChannel,
                             sAudioSampleRate, sAudioChannels);
    sp<MediaSource> audioMutter =
      new AudioMutter(audioSourceEmitter);
    sp<MediaSource> audioEncoder =
      prepareAudioEncoder(mLooper, audioMutter);

    mSegmenter = new MPEG4SegmenterDASH(videoEncoder, audioEncoder, &mVidChannel);
    mSegmenter->run();

    mHardwareActive = true;
    notifyCameraEvent("initialized");

    // Block this thread while camera is running
    mSegmenter->join();
  } else {
    pthread_create(&mAudioThread, NULL, initThreadAudioOnlyWrapper, this);

    CHECK_EQ(mCameraSource->start(), ::OK);
    MediaSourceNullPuller cameraPuller(mCameraSource, "camera");
    if (!cameraPuller.loop()) {
      notifyCameraEvent("error");
    }
  }

  sOpenCVCameraCapture->setPreviewProducerListener(NULL);
  return 0;
}

/**
 * Clean up and stop camera module
 */
int CaptureCommand::capture_cleanup() {
  if (mHardwareActive) {
    mCamera->stopPreview();
    mLooper->stop();

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
 * Get integer camera parameter
 */
int CaptureCommand::capture_getParameterInt(Value& name) {
  LOG_ERROR((name.isNull()), "name not specified");
  LOG_ERROR((mCamera.get() == NULL), "camera not initialized");

  CameraParameters params = mCamera->getParameters();
  int value = params.getInt(name.asCString());

  Value jsonMsg;
  jsonMsg["eventName"] = "getParameter";
  jsonMsg["data"] = value;
  mCaptureListener->sendEvent(jsonMsg);

  return 0;
}

/**
 * Get string camera parameter
 */
int CaptureCommand::capture_getParameterStr(Value& name) {
  LOG_ERROR((name.isNull()), "name not specified");
  LOG_ERROR((mCamera.get() == NULL), "camera not initialized");

  CameraParameters params = mCamera->getParameters();
  const char* value = params.get(name.asCString());

  Value jsonMsg;
  jsonMsg["eventName"] = "getParameter";
  jsonMsg["data"] = value;
  mCaptureListener->sendEvent(jsonMsg);

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

  // Block until the camera service starts up.  There's nothing useful that can
  // be done until that happens anyway.
  sp<IServiceManager> sm = defaultServiceManager();
  for (;;) {
    sp<IBinder> binder = sm->getService(String16("media.camera"));
    if (binder != NULL) {
      break;
    }
  }
  ALOGI("Found media.camera service");

  sOpenCVCameraCapture = new OpenCVCameraCapture();
  err = sOpenCVCameraCapture->publish();
  if (err != 0) {
    ALOGE("Unable to publish OpenCVCameraCapture service: %d", err);
    return 1;
  }

  // Start the data sockets
  Channel micChannel(CAPTURE_MIC_DATA_SOCKET_NAME);
  err = micChannel.startListener();
  if (err < 0) {
    ALOGE("Failed to start capture mic socket listener: %d\n", err);
    return 1;
  }
  Channel vidChannel(CAPTURE_VID_DATA_SOCKET_NAME);
  err = vidChannel.startListener();
  if (err < 0) {
    ALOGE("Failed to start capture vid socket listener: %d\n", err);
    return 1;
  }

  // Start the control socket and register for commands from camera node module
  CaptureListener captureListener(micChannel, vidChannel);
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
