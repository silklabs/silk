//#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture-daemon"
#include <log/log.h>

#include <binder/IServiceManager.h>
#include <binder/ProcessState.h>
#include <cutils/properties.h>
#include <gui/Surface.h>
#include <gui/SurfaceComposerClient.h>
#include <media/openmax/OMX_IVCommon.h>
#ifdef TARGET_GE_NOUGAT
#include <media/openmax/OMX_Audio.h>
#include <media/openmax/OMX_Video.h>
#endif
#include <media/stagefright/AudioSource.h>
#include <media/stagefright/CameraSource.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/foundation/AMessage.h>
#include <media/stagefright/MediaDefs.h>
#include <media/stagefright/MetaData.h>
#ifdef TARGET_GE_NOUGAT
#include <media/stagefright/SimpleDecodingSource.h>
#else
#include <media/stagefright/OMXCodec.h>
#endif
#include <system/audio.h>
#include <utils/Thread.h>
#include <camera/Camera.h>
#ifdef TARGET_GE_NOUGAT
#include <android/hardware/camera2/ICameraDeviceUser.h>
#include <android/hardware/camera2/ICameraDeviceCallbacks.h>
#include <android/hardware/camera2/BnCameraDeviceCallbacks.h>
#include <android/hardware/ICameraService.h>
#else
#include <camera/camera2/ICameraDeviceUser.h>
#include <camera/camera2/ICameraDeviceCallbacks.h>
#endif
#include <camera/camera2/CaptureRequest.h>
#ifdef TARGET_GE_MARSHMALLOW
#include <camera/camera2/OutputConfiguration.h>
#endif
#include <poll.h>

#include "AudioSourceEmitter.h"
#include "AudioMutter.h"
#include "json/json.h"

#include "Channel.h"
#include "MPEG4SegmenterDASH.h"
#include "OpenCVCameraCapture.h"
#include "FrameworkListener1.h"

// From frameworks/base/core/java/android/hardware/camera2/CameraDevice.java
#define TEMPLATE_RECORD 3

using namespace android;
#ifdef TARGET_GE_NOUGAT
using namespace android::hardware;
using namespace android::hardware::camera2;
#endif
using namespace Json;
using namespace std;

#define CAMERA_NAME "capture"
#define CAPTURE_COMMAND_NAME "CaptureCommand"
#define CAPTURE_CTL_SOCKET_NAME "silk_capture_ctl"

//
// Global variables
//
const char* kMimeTypeAvc = "video/avc";
int sCameraId = 0; // 0 = back camera, 1 = front camera
Size sVideoSize(1280, 720);
int32_t sVideoBitRateInK = 1024;
int32_t sFPS = 24;
int32_t sIFrameIntervalS = 1;
int32_t sAudioBitRate = 32000;
int32_t sAudioSampleRate = 8000;
int32_t sAudioChannels = 1;
std::map<std::string,std::string> sInitialCameraParameters;
bool sInitAudio = true;
bool sInitCameraFrames = true;
bool sInitCameraVideo = true;
bool sAudioMute = false;
bool sUseMetaDataMode = true;
sp<OpenCVCameraCapture> sOpenCVCameraCapture = nullptr;

bool sUseCamera2 = false;
sp<ICameraService> sCameraService = nullptr;

bool sStopped = false;

//
// Helper macros
//
#define LOG_ERROR(expression, ...) \
  do { \
    if (expression) { \
      ALOGE(__VA_ARGS__); \
      notifyCameraEventError(); \
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
                 Channel& pcmChannel,
                 Channel& mp4Channel) :
      FrameworkCommand(CAPTURE_COMMAND_NAME),
      mCaptureListener(captureListener),
      mHardwareActive(false),
      mCamera(nullptr),
      mSegmenter(nullptr),
      mVideoLooper(nullptr),
      mCameraSource(nullptr),
      mAudioMutter(nullptr),
      mPcmChannel(pcmChannel),
      mMp4Channel(mp4Channel),
      mCameraDeviceUser(nullptr) {
  }

  virtual ~CaptureCommand() {}

  // FrameworkCommand
  int runCommand(SocketClient *c, int argc, char ** argv);

  // OpenCVCameraCapture::PreviewProducerListener
  void onPreviewProducer();

private:
  int capture_init(Value& cmdData);
  int capture_update(Value& cmdData);
  int capture_stop();
  int capture_setParameter(Value& name, Value& value);
  int capture_getParameterInt(Value& name);
  int capture_getParameterStr(Value& name);
  static void* initThreadCameraWrapper(void* me);
  static void* initThreadAudioOnlyWrapper(void* me);
  status_t setPreviewTarget();

  status_t initThreadAudioOnly();
  void notifyCameraEvent(const char* eventName);
  void notifyCameraEventError();

  CaptureListener* mCaptureListener;
  Reader mJsonReader;
  pthread_t mCameraThread;
  pthread_t mAudioThread;

  bool mHardwareActive;
  sp<ICameraService> mCameraService;

 // Camera1:
  status_t initThreadCamera1();
  sp<Camera> mCamera;

  // Faux preview target for when there's no client preview producer around
  sp<SurfaceControl> mPreviewSurfaceControl;

  sp<MPEG4SegmenterDASH> mSegmenter;
  sp<ALooper> mVideoLooper;
  sp<CameraSource> mCameraSource;
  sp<AudioMutter> mAudioMutter;
  Channel& mPcmChannel;
  Channel& mMp4Channel;
  Mutex mPreviewTargetLock;

 // Camera2:
  status_t initThreadCamera2();
  sp<ICameraDeviceUser> mCameraDeviceUser;
};

/**
 * This class provides a wrapper around capture socket to help with
 * sending and receiving messages using the capture socket.
 */
class CaptureListener: private FrameworkListener1 {
public:
  CaptureListener(
    Channel& pcmChannel,
    Channel& mp4Channel
  ) : FrameworkListener1(CAPTURE_CTL_SOCKET_NAME) {
    FrameworkListener1::registerCmd(
      new CaptureCommand(
        this,
        pcmChannel,
        mp4Channel
      )
    );
  }

  int start() {
    ALOGD("Starting CaptureListener");
    return FrameworkListener1::startListener();
  }

  int stop() {
    ALOGD("Stopping CaptureListener");
    return FrameworkListener1::stopListener();
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

  void sendErrorEvent() {
    if (sStopped) {
      ALOGD("Stopped. Camera error notification suppressed");
      return;
    }
    Value jsonMsg;
    jsonMsg["eventName"] = "error";
    sendEvent(jsonMsg);
  }
};


/**
 * Listens for Camera 1 events
 */
class CaptureCameraListener: public CameraListener {
 public:
  CaptureCameraListener(CaptureListener *captureListener, Channel *mp4Channel)
      : mCaptureListener(captureListener),
        mMp4Channel(mp4Channel),
        focusMoving(false) {
  }

  void notify(int32_t msgType, int32_t ext1, int32_t ext2) {
    if (msgType == CAMERA_MSG_FOCUS_MOVE) {
      if ( (ext1 == 1) != focusMoving) {
        focusMoving = ext1 == 1;
        ALOGW("Camera focus moving: %d", focusMoving);
      }
    } else if (msgType == CAMERA_MSG_FOCUS) {
      ALOGD("Camera focus result: %d", ext1);
    } else if (msgType == CAMERA_MSG_ERROR) {
      ALOGW("Camera error #%d", ext1);
      mCaptureListener->sendErrorEvent();
    } else {
      ALOGD("notify: msgType=0x%x ext1=%d ext2=%d", msgType, ext1, ext2);
    }
  }

  void postData(int32_t msgType, const sp<IMemory>& dataPtr,
      camera_frame_metadata_t *metadata) {
    (void) dataPtr;
    if ((CAMERA_MSG_PREVIEW_METADATA & msgType) && metadata) {
      size_t size = sizeof(camera_face_t) * metadata->number_of_faces;
      void *faceData = malloc(size);
      if (faceData != nullptr) {
        memcpy(faceData, metadata->faces, size);
        mMp4Channel->send(TAG_FACES, faceData, size, free, faceData);
      }
    } else {
      ALOGD("postData: msgType=0x%x", msgType);
    }
  }

  void postDataTimestamp(nsecs_t timestamp, int32_t msgType,
      const sp<IMemory>& dataPtr) {
    (void) timestamp;
    (void) dataPtr;
    ALOGD("postDataTimestamp: msgType=0x%x", msgType);
  }

#ifdef TARGET_GE_NOUGAT
  void postRecordingFrameHandleTimestamp(
    nsecs_t timestamp,
    native_handle_t* handle
  ) {
    (void) timestamp;
    (void) handle;
    ALOGV("postRecordingFrameHandleTimestamp");
  }
#endif
 private:
  CaptureListener *mCaptureListener;
  Channel *mMp4Channel;
  bool focusMoving;
};

/**
 * Listens for Camera 2 events
 */
class CameraDeviceCallbacks: public BinderService<CameraDeviceCallbacks>,
                             public BnCameraDeviceCallbacks,
                             public IBinder::DeathRecipient {
 public:
  CameraDeviceCallbacks(CaptureListener* captureListener)
      : mCaptureListener(captureListener) {}

  void binderDied(const wp<IBinder> &who) {
    (void) who;
    ALOGI("CameraDeviceCallbacks::binderDied");
  }

#ifdef TARGET_GE_NOUGAT
  typedef int32_t CameraErrorCode;
  typedef binder::Status status;
  #define STATUS_OK return binder::Status()
#else
  typedef void status;
  #define STATUS_OK
#endif

  status onDeviceError(
    CameraErrorCode errorCode,
    const CaptureResultExtras& resultExtras
  ) {
    (void) resultExtras;
    ALOGW("CameraDeviceCallbacks::onDeviceError: errorCode=%d", errorCode);
    STATUS_OK;
  }

  status onDeviceIdle() {
    ALOGI("CameraDeviceCallbacks::onDeviceIdle");
    STATUS_OK;
  }

  status onCaptureStarted(
    const CaptureResultExtras& resultExtras,
    int64_t timestamp
  ) {
    (void) resultExtras;
    (void) timestamp;
    ALOGV("CameraDeviceCallbacks::onCaptureStarted: %lld requestId=%d frameNumber=%lld",
      timestamp, resultExtras.requestId, resultExtras.frameNumber);

    // Wait for the second frame before declaring the camera initialized.  On
    // openplus3 there's about a 5 second delay between frameNumber 0 and
    // frameNumber 1 (after which the frame arrival rate is normal)
    if (resultExtras.frameNumber == 1) {
      Value jsonMsg;
      jsonMsg["eventName"] = "initialized";
      mCaptureListener->sendEvent(jsonMsg);
    }
    STATUS_OK;
  }

  status onResultReceived(
    const CameraMetadata& metadata,
    const CaptureResultExtras& resultExtras
  ) {
    (void) metadata;
    (void) resultExtras;
    ALOGV("CameraDeviceCallbacks::onResultReceived");
    STATUS_OK;
  }

  status onPrepared(int streamId) {
    ALOGV("CameraDeviceCallbacks::onPrepared: %d", streamId);
    STATUS_OK;
  }

#ifdef TARGET_GE_NOUGAT
  status onRepeatingRequestError(int64_t lastFrameNumber) {
    ALOGV("CameraDeviceCallbacks::onRepeatingRequestError: %lld", lastFrameNumber);
    STATUS_OK;
  }
#endif

#undef STATUS_OK
 private:
  CaptureListener* mCaptureListener;
};


/**
 * This function is run when a capture command is received from the client
 */
int CaptureCommand::runCommand(SocketClient *c, int argc, char ** argv) {
  (void) c;
  (void) argc;
  ALOGD("Received command %s", argv[0]);

  if (sStopped) {
    ALOGI("Stopped, command ignored");
    return 0;
  }

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
    capture_stop();
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
  }

  if (!cmdData["video"].isNull()) {
    sInitCameraVideo = cmdData["video"].asBool();
    ALOGV("sInitCameraVideo %d", sInitCameraVideo);
    if (sInitCameraVideo) {
      LOG_ERROR(!sInitCameraFrames,
        "Must init camera frames for camera video"); // TODO: Relax this
    }
  }

  if (!cmdData["cameraId"].isNull()) {
    sCameraId = cmdData["cameraId"].asInt();
    ALOGV("sCameraId %d", sCameraId);
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
  if (!cmdData["videoSegmentLength"].isNull()) {
    sIFrameIntervalS = cmdData["videoSegmentLength"].asInt();
    ALOGV("sIFrameIntervalS %d", sIFrameIntervalS);
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

  sInitialCameraParameters.clear();
  if (cmdData["cameraParameters"].isObject()) {
    auto params = cmdData["cameraParameters"];
    auto names = params.getMemberNames();
    for (auto name: names) {
      if (params[name].isString()) {
        auto value = params[name].asString();
        sInitialCameraParameters[name] = value;
      }
    }
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
    if (mAudioMutter != nullptr) {
      mAudioMutter->setMute(sAudioMute);
    }
    if (mSegmenter != nullptr) {
      mSegmenter->setMute(sAudioMute);
    }
  }
  return 0;
}

void* CaptureCommand::initThreadCameraWrapper(void* me) {
  CaptureCommand* command = static_cast<CaptureCommand *>(me);
  if (sUseCamera2) {
    command->initThreadCamera2();
  } else {
    command->initThreadCamera1();
  }
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
  return OK;
}


/**
 * Notification when a client preview producer has connected.
 */
void CaptureCommand::onPreviewProducer() {
  if (sUseCamera2) {
    // TODO: Permit the preview producer to connect *after* the pipeline is
    //       initialized
    CHECK(false);
  } else {
    CHECK(setPreviewTarget() == 0);
  }
}

sp<MediaCodecSource> prepareVideoEncoder(const sp<ALooper>& looper,
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
  //format->setInt32("profile", OMX_VIDEO_AVCProfileBaseline);
  //format->setInt32("level", OMX_VIDEO_AVCLevel12);
  format->setInt32("bitrate", sVideoBitRateInK * 1024);
  format->setInt32("bitrate-mode", OMX_Video_ControlRateVariable);
  format->setFloat("frame-rate", sFPS);
  format->setInt32("i-frame-interval", sIFrameIntervalS);

  return MediaCodecSource::Create(
    looper,
    format,
    source,
#ifdef TARGET_GE_MARSHMALLOW
    NULL,
#endif
#ifdef TARGET_GE_NOUGAT
    0
#else
    sUseMetaDataMode ? MediaCodecSource::FLAG_USE_METADATA_INPUT : 0
#endif
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
      if (err != OK) {
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

  sp<MediaSource> audioSourceEmitter = new AudioSourceEmitter(
    audioSource,
    sInitAudio ? &mPcmChannel : nullptr,
    sAudioSampleRate,
    sAudioChannels
  );
  mAudioMutter = new AudioMutter(audioSourceEmitter, sAudioMute);
  CHECK_EQ(mAudioMutter->start(), OK);
  MediaSourceNullPuller audioPuller(mAudioMutter, "audio");

  // Notify that audio is initialized
  mHardwareActive = true;
  notifyCameraEvent("initialized");

  // Pull out buffers as fast as they come.  The TAG_PCM data will will sent as
  // a side effect
  if (!audioPuller.loop()) {
    notifyCameraEventError();
  }
  return 0;
}

/**
 * Thread function that initializes the camera using the camera1 API
 */
status_t CaptureCommand::initThreadCamera1() {
  // Make several attempts to connect with the camera.  Reconnects in particular
  // can fail a couple times as the camera subsystem recovers.
  for (int attempts = 0; ; ++attempts) {
    mCamera = Camera::connect(
      sCameraId,
      String16(CAMERA_NAME),
      Camera::USE_CALLING_UID
#ifdef TARGET_GE_NOUGAT
      ,
      Camera::USE_CALLING_PID
#endif
    );
    if (mCamera != NULL) {
      break;
    }
    if (attempts == 40 /* ~20 seconds */) {
      ALOGE("Too many failed attempts to connect to camera");
      return -1;
    }
    ALOGI("Unable to connect to camera, attempt #%d", attempts);
    poll(NULL, 0, 500 /*ms*/);
  }
  ALOGI("Connected to camera service");

  sp<CaptureCameraListener> listener = new CaptureCameraListener(
    mCaptureListener,
    &mMp4Channel
  );
  mCamera->setListener(listener);

  {
    status_t err;
    char previewSize[80];
    snprintf(previewSize, sizeof(previewSize), "%dx%d", sVideoSize.width, sVideoSize.height);
    CameraParameters params = mCamera->getParameters();
    params.set(CameraParameters::KEY_PREVIEW_SIZE, previewSize);
    params.set(CameraParameters::KEY_PREVIEW_FORMAT, "yuv420sp");

    for (auto it = sInitialCameraParameters.begin();
         it != sInitialCameraParameters.end();
         ++it) {
      params.set(it->first.c_str(), it->second.c_str());
    }
    err = mCamera->setParameters(params.flatten());
    CHECK(err == 0);

    params = mCamera->getParameters();
    params.set(CameraParameters::KEY_FOCUS_MODE, CameraParameters::FOCUS_MODE_CONTINUOUS_PICTURE);
    err = mCamera->setParameters(params.flatten());
    if (err != OK) {
      ALOGW("Error %d: Unable to set focus mode", err);
    }

    ALOGW("Initial camera parameters:");
    params = mCamera->getParameters();
    params.dump();
  }

  sOpenCVCameraCapture->setPreviewProducerListener(this);
  CHECK(setPreviewTarget() == 0);

  //CHECK(mCamera->sendCommand(CAMERA_CMD_START_FACE_DETECTION, CAMERA_FACE_DETECTION_SW, 0) == 0);
  CHECK(mCamera->sendCommand(CAMERA_CMD_ENABLE_FOCUS_MOVE_MSG, 1, 0) == 0);

  mCameraSource = CameraSource::CreateFromCamera(
    mCamera->remote(),
    mCamera->getRecordingProxy(),
    sCameraId,
    String16(CAMERA_NAME, strlen(CAMERA_NAME)),
    Camera::USE_CALLING_UID,
#ifdef TARGET_GE_NOUGAT
    Camera::USE_CALLING_PID,
#endif
    sVideoSize,
    sFPS,
    NULL,
    sUseMetaDataMode
  );
  CHECK_EQ(mCameraSource->initCheck(), OK);

  {
    status_t err = mCamera->autoFocus();
    if (err != OK) {
      ALOGW("Error %d: Unable to set autofocus", err);
    }
  }

  if (sInitCameraVideo) {
    mVideoLooper = new ALooper;
    mVideoLooper->setName("capture-looper");
    mVideoLooper->start();

    sp<MediaCodecSource> videoEncoder = prepareVideoEncoder(
      mVideoLooper,
      mCameraSource
    );
    LOG_ERROR(videoEncoder == NULL, "Unable to prepareVideoEncoder");

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

    sp<MediaSource> audioSourceEmitter = new AudioSourceEmitter(
      audioSource,
      sInitAudio ? &mPcmChannel : nullptr,
      sAudioSampleRate,
      sAudioChannels
    );
    mAudioMutter = new AudioMutter(audioSourceEmitter, sAudioMute);
    sp<MediaSource> audioEncoder =
      prepareAudioEncoder(mVideoLooper, mAudioMutter);

    mSegmenter = new MPEG4SegmenterDASH(
      videoEncoder,
      audioEncoder,
      &mMp4Channel,
      sAudioMute
    );
    mSegmenter->run("MPEG4SegmenterDASH");

    mHardwareActive = true;
    notifyCameraEvent("initialized");

    // Block this thread while camera is running
    mSegmenter->join();
  } else {
    CHECK_EQ(mCameraSource->start(), OK);
    MediaSourceNullPuller cameraPuller(mCameraSource, "camera");

    if (sInitAudio) {
      pthread_create(&mAudioThread, NULL, initThreadAudioOnlyWrapper, this);
    } else {
      mHardwareActive = true;
      notifyCameraEvent("initialized");
    }

    // Block this thread while camera is running
    if (!cameraPuller.loop()) {
      notifyCameraEventError();
    }
  }

  sOpenCVCameraCapture->setPreviewProducerListener(NULL);
  return 0;
}

/**
 * Thread function that initializes the camera using the camera2 API
 */
status_t CaptureCommand::initThreadCamera2() {

  sp<CameraDeviceCallbacks> cameraDeviceCallbacks =
    new CameraDeviceCallbacks(mCaptureListener);

#ifdef TARGET_GE_NOUGAT
  #define ISOK(status) (status.isOk())
#else
  #define ISOK(status) (status == 0)
#endif
  auto err = sCameraService->connectDevice(
    cameraDeviceCallbacks,
    sCameraId,
    String16(CAMERA_NAME),
    ICameraService::USE_CALLING_UID,
#ifdef TARGET_GE_NOUGAT
    &mCameraDeviceUser
#else
    mCameraDeviceUser
#endif
  );

  if (!ISOK(err)) {
#ifdef TARGET_GE_NOUGAT
    ALOGE(
      "Unable to connect to camera: %s",
      static_cast<const char *>(err.toString8())
    );
#else
    ALOGE("Unable to connect to camera: error=%d", err);
#endif
    CHECK(false);
  }

  err = mCameraDeviceUser->waitUntilIdle();
  CHECK(ISOK(err));

  err = mCameraDeviceUser->beginConfigure();
  CHECK(ISOK(err));

  sOpenCVCameraCapture->setPreviewProducerListener(this);

  sp<IGraphicBufferProducer> previewProducer;
  sp<Surface> surface;

#ifdef CAMERA2_DEBUG_PREVIEW_SURFACE
  sp<SurfaceControl> previewSurfaceControl;
  sp<SurfaceComposerClient> sCClient = new SurfaceComposerClient();
  if (sCClient.get() == NULL) {
    ALOGE("Unable to establish connection to Surface Composer");
    CHECK(false);
  }
  previewSurfaceControl = sCClient->createSurface(String8("preview-debug"),
      500, 500, PIXEL_FORMAT_RGBX_8888, 0);
  if (previewSurfaceControl == NULL) {
    ALOGE("Unable to create preview surface");
    CHECK(false);
  }
  surface = previewSurfaceControl->getSurface();
  previewProducer = surface->getIGraphicBufferProducer();
#else
  // TODO: Permit the preview producer to connect *after* the pipeline is
  //       initialized
  previewProducer = sOpenCVCameraCapture->getPreviewProducer();
  CHECK(previewProducer != nullptr);
  surface = new Surface(previewProducer, /*controlledByApp*/false);
#endif

  status_t streamId = -1;
#ifdef TARGET_GE_NOUGAT
  OutputConfiguration outputConfig(previewProducer, 0);
  (void) mCameraDeviceUser->createStream(outputConfig, &streamId);
#elif TARGET_GE_MARSHMALLOW
  OutputConfiguration outputConfig(previewProducer, 0);
  streamId = mCameraDeviceUser->createStream(outputConfig);
#else
  streamId = mCameraDeviceUser->createStream(
    sVideoSize.width,
    sVideoSize.height,
    HAL_PIXEL_FORMAT_IMPLEMENTATION_DEFINED,
    previewProducer);
#endif

  if (streamId < 0) {
    ALOGE("Unable to createStream: %d", streamId);
    CHECK(false);
  }

  err = mCameraDeviceUser->endConfigure(
#ifdef TARGET_GE_NOUGAT
  /*isConstrainedHighSpeed = */ false
#endif
  );
  CHECK(ISOK(err));

  CameraMetadata requestTemplate;
  err = mCameraDeviceUser->createDefaultRequest(TEMPLATE_RECORD, &requestTemplate);
  CHECK(ISOK(err));

  int64_t lastFrameNumber = 0;

  int requestId = -1;
#ifdef TARGET_GE_NOUGAT
  ::android::CaptureRequest request;
  request.mIsReprocess = false;
  request.mMetadata = requestTemplate;
  request.mSurfaceList.add(surface);

  utils::SubmitInfo si;
  (void) mCameraDeviceUser->submitRequest(
    request,
    /*streaming = */ true,
    &si
  );
  requestId = si.mRequestId;
  lastFrameNumber = si.mLastFrameNumber;
#else
  sp<CaptureRequest> request(new CaptureRequest());
#ifdef TARGET_GE_MARSHMALLOW
  request->mIsReprocess = false;
#endif
  request->mMetadata = requestTemplate;
  request->mSurfaceList.add(surface);

  requestId = mCameraDeviceUser->submitRequest(
    request,
    /*streaming = */ true,
    &lastFrameNumber
  );
#endif
  ALOGE("Camera submitRequest: %d, lastFrameNumber: %lld", requestId, lastFrameNumber);
  if (requestId < 0) {
    ALOGE("submitRequest failed, error=%d", requestId);
    CHECK(false);
  }

  // TODO: Port camera parameter support to camera2 API...
  for (auto it = sInitialCameraParameters.begin();
       it != sInitialCameraParameters.end();
       ++it) {
    ALOGW("TODO: initial camera parameter ignored: %s=%s",
      it->first.c_str(), it->second.c_str());
  }

  if (sInitCameraVideo) {
    ALOGW("TODO: add camera2 API video support");
    CHECK(false);
  } else {
    if (sInitAudio) {
      pthread_create(&mAudioThread, NULL, initThreadAudioOnlyWrapper, this);
    } else {
      mHardwareActive = true;
      // NB: |notifyCameraEvent("initialized")| is emitted from
      // CameraDeviceCallbacks::onCaptureStarted()
    }
  }

  return 0;
#undef ISOK
}

/**
 * Clean up and stop camera module
 */
int CaptureCommand::capture_stop() {
  sStopped = true;
  mCaptureListener->stop();

  LOG_ERROR(sUseCamera2, "TODO: port stop to camera2 API");
  sOpenCVCameraCapture->setPreviewProducerListener(NULL);
  sOpenCVCameraCapture->closeCamera();

  if (mHardwareActive) {
    mHardwareActive = false;
    if (mCamera.get() != nullptr) {
      if (mVideoLooper.get() != nullptr) {
        mVideoLooper->stop();
      }
      if (mAudioMutter.get() != nullptr) {
        mAudioMutter->stop();
      }

      if (mCameraSource.get() != nullptr) {
        mCameraSource->stop();
      }

      if (mCamera.get() != nullptr) {
        mCamera->disconnect();
      }
    }
  }

  // Exit rather than trying to deal with restarting, as on a "stopped" event
  // the process gets resarted anyway.
  ALOGI("Exit");
  exit(0);
  //notifyCameraEvent("stopped");
  return 0;
}

/**
 * Set a camera parameter
 */
int CaptureCommand::capture_setParameter(Value& name, Value& value) {
  LOG_ERROR((name.isNull()), "name not specified");
  LOG_ERROR((value.isNull()), "value not specified");
  LOG_ERROR(sUseCamera2, "TODO: port setParameter to camera2 API");
  LOG_ERROR((mCamera.get() == NULL), "camera not initialized");

  CameraParameters params = mCamera->getParameters();
  params.set(name.asCString(), value.asCString());
  status_t err = mCamera->setParameters(params.flatten());
  if (err != OK) {
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
  LOG_ERROR(sUseCamera2, "TODO: port getParameter to camera2 API");
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
  LOG_ERROR(sUseCamera2, "TODO: port getParameter to camera2 API");
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

void CaptureCommand::notifyCameraEventError() {
  mCaptureListener->sendErrorEvent();
}

/**
 * Entry point into the capture service
 */
int main(int argc, char **argv) {
  (void) argc;
  (void) argv;

  status_t err;

  ALOGI("Capture starting");

  sp<ProcessState> proc(ProcessState::self());
  ProcessState::self()->startThreadPool();

  // Block until the camera service starts up.  There's nothing useful that can
  // be done until that happens anyway.
  sp<IServiceManager> sm = defaultServiceManager();
  for (;;) {
    sp<IBinder> binder = sm->getService(String16("media.camera"));
    if (binder != nullptr) {
      sCameraService = interface_cast<ICameraService>(binder);
      break;
    }
  }

#ifndef TARGET_GE_NOUGAT
  auto numCameras = sCameraService->getNumberOfCameras();
  ALOGI("%d cameras found", numCameras);
#endif

  bool camera2Supported = false;
#ifdef TARGET_GE_NOUGAT
  (void) sCameraService->supportsCameraApi(
    /*cameraId=*/ 0,
    ICameraService::API_VERSION_2,
    &camera2Supported
  );
#else
  err = sCameraService->supportsCameraApi(/*cameraId=*/ 0, ICameraService::API_VERSION_2);
  if (err == 0) {
    camera2Supported = true;
  }
#endif
  if (camera2Supported) {
    ALOGI("camera2 API supported on this device.");
#ifdef TARGET_USE_CAMERA2
    sUseCamera2 = true;
#endif
  }
  ALOGI("Selected camera API: %d", sUseCamera2 ? 2 : 1);

  sOpenCVCameraCapture = new OpenCVCameraCapture();
  err = sOpenCVCameraCapture->publish();
  if (err != 0) {
    ALOGE("Unable to publish OpenCVCameraCapture service: %d", err);
    return 1;
  }

  // Start the data sockets
  Channel pcmChannel(CAPTURE_PCM_DATA_SOCKET_NAME);
  err = pcmChannel.startListener();
  if (err < 0) {
    ALOGE("Failed to start capture pcm socket listener: %d\n", err);
    return 1;
  }
  Channel mp4Channel(CAPTURE_MP4_DATA_SOCKET_NAME);
  err = mp4Channel.startListener();
  if (err < 0) {
    ALOGE("Failed to start capture mp4 socket listener: %d\n", err);
    return 1;
  }

  // Start the control socket and register for commands from camera node module
  CaptureListener captureListener(
    pcmChannel,
    mp4Channel
  );
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
