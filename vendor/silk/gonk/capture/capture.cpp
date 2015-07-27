
#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture"
#include <utils/Log.h>

#include <binder/ProcessState.h>
#include <media/stagefright/foundation/ABuffer.h>
#include <media/stagefright/foundation/AMessage.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/AudioSource.h>
#include <media/stagefright/CameraSource.h>
#include <media/stagefright/MediaDefs.h>
#include <media/stagefright/MetaData.h>
#include <media/stagefright/MediaCodec.h>
#include <media/stagefright/OMXCodec.h>
#include <media/MediaProfiles.h>
#include <gui/Surface.h>
#include <gui/SurfaceComposerClient.h>
#include <include/avc_utils.h>
#include <utils/Thread.h>
#include <getopt.h>
#include <sys/time.h>
#include "MPEG4MemoryWriter.h"
#include <sysutils/FrameworkListener.h>
#include <json/json.h>

extern "C" {
#include "jpeglib.h"
}

// This is an ugly hack. We forked this from libstagefright
// so we can trigger I-Frame injection.
#include "MediaCodecSource.h"

using namespace android;
using namespace Json;

//
// Constants
//
static const char* kMimeTypeAvc = "video/avc";

static status_t OK = static_cast<status_t>(android::OK);

static bool sDebug = false;
static Size sVideoSize(1280, 720);
static int32_t sVideoBitRateInK = 1024;
static int32_t sFPS = 24;
static int32_t sIFrameIntervalSec = 15;
static int32_t sPreviewScale = 4;
static int32_t sPreviewSkipCount = 5;
static int32_t sAudioBitRate = 32000;
static int32_t sAudioSampleRate = 8000;
static int32_t sAudioChannels = 1;

#define TAG_VIDEO 0
#define TAG_PREVIEW 1
#define TAG_FACES 2

#define CAPTURE_CTL_SOCKET_NAME "capturectl"
#define CAPTURE_DATA_SOCKET_NAME "captured"
#define CAPTURE_COMMAND_NAME "CaptureCommand"
#define MAX_MSG_SIZE 128
#define CAMERA_NAME "capture"

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


class Channel {
  Mutex mLock;

  void send(const void *data, size_t size);

  template <typename T>
  void send(T value) {
    send(&value, sizeof(T));
  }
public:
  void send(int32_t tag, const void *data, size_t size);
  void send(int32_t tag, timeval &when, const void *data, size_t size);
};

void Channel::send(const void *data, size_t size) {
  // Write data to stdout
  const char *ptr = static_cast<const char *>(data);
  ssize_t remaining = size;
  while (remaining > 0) {
    ssize_t written = write(STDOUT_FILENO, ptr, remaining);
    if (written == -EINTR)
      continue;
    CHECK(written >= 0);
    remaining -= written;
    ptr += written;
  }
  fsync(STDOUT_FILENO);
}

void Channel::send(int32_t tag, timeval &when, const void *data, size_t size) {
  if (sDebug) {
    printf("tag:%d, size: %d, when:%ld.%ld\n", tag, size, when.tv_sec, when.tv_usec);
    return;
  }

  Mutex::Autolock autoLock(mLock);

  send(int32_t(size));
  send(int32_t(tag));
  send(timeval(when));
  send(data, size);
}

void Channel::send(int32_t tag, const void *data, size_t size) {
  timeval when;
  gettimeofday(&when, NULL);
  send(tag, when, data, size);
}


class PreviewMediaSource : public MediaSource {
public:
  PreviewMediaSource(Channel *channel, const sp<MediaSource> &source, int skipCount);
  virtual ~PreviewMediaSource();

  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();

  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);
private:
  Channel *mChannel;
  sp<MediaSource> mSource;
  int mSkipCount;
  int mCounter;

  void snapshot(MediaBuffer* img);

  DISALLOW_EVIL_CONSTRUCTORS(PreviewMediaSource);
};

PreviewMediaSource::PreviewMediaSource(Channel *channel, const sp<MediaSource> &source, int skipCount) :
  mChannel(channel), mSource(source), mSkipCount(skipCount), mCounter(0) { }

PreviewMediaSource::~PreviewMediaSource()
{ }

status_t PreviewMediaSource::start(MetaData *params) {
  return mSource->start(params);
}

status_t PreviewMediaSource::stop() {
  return mSource->stop();
}

sp<MetaData> PreviewMediaSource::getFormat() {
  return mSource->getFormat();
}

status_t PreviewMediaSource::read(MediaBuffer **buffer, const ReadOptions *options) {
  status_t err = mSource->read(buffer, options);
  if (err != ::OK)
    return err;
  if (mCounter++ >= mSkipCount) {
    snapshot(*buffer);
    mCounter = 0;
  }
  return ::OK;
}

struct jpeg_state {
  jpeg_compress_struct cinfo;
  Vector<JOCTET> buffer;
};

static void jpeg_init_destination(j_compress_ptr cinfo)
{
  jpeg_state *state = reinterpret_cast<jpeg_state *>(cinfo);
  state->buffer.resize(1024 * 1024);
  cinfo->dest->next_output_byte = state->buffer.begin();
  cinfo->dest->free_in_buffer = state->buffer.size();
}

static boolean jpeg_empty_output_buffer(j_compress_ptr cinfo)
{
  jpeg_state *state = reinterpret_cast<jpeg_state *>(cinfo);
  size_t oldsize = state->buffer.size();
  state->buffer.resize(oldsize * 2);
  cinfo->dest->next_output_byte = state->buffer.begin() + oldsize;
  cinfo->dest->free_in_buffer = oldsize;
  return true;
}

static void jpeg_term_destination(j_compress_ptr cinfo)
{
  jpeg_state *state = reinterpret_cast<jpeg_state *>(cinfo);
  state->buffer.resize(state->buffer.size() - cinfo->dest->free_in_buffer);
}

void PreviewMediaSource::snapshot(MediaBuffer* img) {
  sp<MetaData> meta = mSource->getFormat();
  int32_t width, height, stride, sliceHeight, colorFormat;
  CHECK(meta->findInt32(kKeyWidth, &width));
  CHECK(meta->findInt32(kKeyHeight, &height));
  CHECK(meta->findInt32(kKeyStride, &stride));
  CHECK(meta->findInt32(kKeySliceHeight, &sliceHeight));
  CHECK(meta->findInt32(kKeyColorFormat, &colorFormat));

  int32_t imageWidth = width/sPreviewScale;
  int32_t imageHeight = height/sPreviewScale;

  jpeg_state state;
  struct jpeg_compress_struct *cinfo = &state.cinfo;
  struct jpeg_error_mgr jerr;
  cinfo->err = jpeg_std_error(&jerr);
  jpeg_create_compress(cinfo);

  jpeg_destination_mgr mgr;
  mgr.init_destination = &jpeg_init_destination;
  mgr.empty_output_buffer = &jpeg_empty_output_buffer;
  mgr.term_destination = &jpeg_term_destination;
  cinfo->dest = &mgr;

  cinfo->image_width = imageWidth;
  cinfo->image_height = imageHeight;
  cinfo->input_components = 3;
  cinfo->in_color_space = JCS_YCbCr;

  jpeg_set_defaults(cinfo);
  jpeg_set_quality(cinfo, 80, TRUE);

  jpeg_start_compress(cinfo, TRUE);

  const uint8_t *frame = reinterpret_cast<uint8_t*>(img->data()) + img->range_offset();
  const uint8_t *y_plane = frame;
  const uint8_t *cbcr_plane = frame + sliceHeight * stride;

  uint8_t buffer[3 * (imageWidth + 1)];
  for (int row = 0; row < imageHeight; row++) {
    int32_t ycbcr_row = row * sPreviewScale;
    const uint8_t *y_row = y_plane + ycbcr_row * stride;
    const uint8_t *cbcr_row = cbcr_plane + (ycbcr_row / 2) * stride;
    for (int x = 0; x < imageWidth; x++) {
      int32_t ycbcr_x = x * sPreviewScale;
      buffer[x*3+0] = y_row[ycbcr_x];
      buffer[x*3+1] = cbcr_row[(ycbcr_x&(~1))];
      buffer[x*3+2] = cbcr_row[(ycbcr_x&(~1))+1];
    }
    JSAMPROW rowptr = reinterpret_cast<JSAMPROW>(buffer);
    jpeg_write_scanlines(cinfo, &rowptr, 1);
  }

  jpeg_finish_compress(cinfo);
  jpeg_destroy_compress(cinfo);

  mChannel->send(TAG_PREVIEW, state.buffer.begin(), state.buffer.size());
}

class PutBackWrapper : public MediaSource {
public:
  PutBackWrapper(const sp<MediaSource> &source);
  virtual ~PutBackWrapper();

  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();

  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);

  void putBack(MediaBuffer **buffer);

private:
  sp<MediaSource> mSource;
  Vector<MediaBuffer*> mStash;
  bool mDone;

  DISALLOW_EVIL_CONSTRUCTORS(PutBackWrapper);
};

PutBackWrapper::PutBackWrapper(const sp<MediaSource> &source) :
  mSource(source), mDone(false) { }

PutBackWrapper::~PutBackWrapper()
{
  for (size_t n = 0; n < mStash.size(); ++n)
    mStash[n]->release();
}

status_t PutBackWrapper::start(MetaData *params) {
  return mSource->start(params);
}

status_t PutBackWrapper::stop() {
  return mSource->stop();
}

sp<MetaData> PutBackWrapper::getFormat() {
  return mSource->getFormat();
}

status_t PutBackWrapper::read(MediaBuffer **buffer, const ReadOptions *options)
{
  if (mStash.size() > 0) {
    *buffer = mStash.top();
    mStash.pop();
    return ::OK;
  }
  status_t err = mSource->read(buffer, options);
  if (err != ::OK)
    mDone = true;
  return err;
}

void PutBackWrapper::putBack(MediaBuffer **buffer)
{
  mStash.push(*buffer);
  *buffer = NULL;
}

class SliceListener {
public:
  virtual ~SliceListener() { };

  virtual void handleProgressEvent(int64_t timeUs, bool slice) = 0;
};

class SliceAtEachIDRSource : public MediaSource {
public:
  SliceAtEachIDRSource(const sp<MediaSource> &source);
  virtual ~SliceAtEachIDRSource();

  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();

  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);

  void addListener(SliceListener *listener) { mListeners.push(listener); }
private:
  sp<PutBackWrapper> mSource;
  bool mStarted;
  bool mIDRSeen;
  Vector<SliceListener*> mListeners;

  void notifyListeners(int64_t timeUs, bool slice);

  DISALLOW_EVIL_CONSTRUCTORS(SliceAtEachIDRSource);
};

SliceAtEachIDRSource::SliceAtEachIDRSource(const sp<MediaSource> &source)
  : mSource(new PutBackWrapper(source)),
    mStarted(false),
    mIDRSeen(false)
{ }

SliceAtEachIDRSource::~SliceAtEachIDRSource()
{ }

status_t SliceAtEachIDRSource::start(MetaData *params) {
  mIDRSeen = false;
  if (mStarted) // don't start again
    return ::OK;
  mStarted = true;
  return mSource->start(params);
}

status_t SliceAtEachIDRSource::stop() {
  // we don't stop here since we start()/stop() repeatedly
  return ::OK;
}

sp<MetaData> SliceAtEachIDRSource::getFormat() {
  return mSource->getFormat();
}

status_t SliceAtEachIDRSource::read(MediaBuffer **buffer, const ReadOptions *options) {
  status_t err = mSource->read(buffer, options);
  if (err != ::OK) {
    // Stop the input stream here
    mSource->stop();
    return err;
  }

  int64_t timeUs;
  if (!(*buffer)->meta_data()->findInt64(kKeyTime, &timeUs))
    timeUs = 0;

  int32_t config;
  if ((*buffer)->meta_data()->findInt32(kKeyIsCodecConfig, &config) && config) {
    // Make sure we find the codec config for the next slices in getFormat()
    sp<ABuffer> au = new ABuffer(static_cast<char *>((*buffer)->data()) +
				 (*buffer)->range_offset(),
				 (*buffer)->range_length());
    sp<MetaData> meta = MakeAVCCodecSpecificData(au);
    const void *data;
    size_t size;
    uint32_t type;
    if (meta->findData(kKeyAVCC, &type, &data, &size))
      mSource->getFormat()->setData(kKeyAVCC, type, data, size);
  }

  int32_t isSync;
  if ((*buffer)->meta_data()->findInt32(kKeyIsSyncFrame, &isSync) && isSync) {
    if (mIDRSeen) {
      // Terminate the stream at the IDR
      mSource->putBack(buffer);

      // Slice the stream here
      notifyListeners(timeUs, true);
      return ERROR_END_OF_STREAM;
    }
    mIDRSeen = true;
  }

  // Progress but we aren't slicing
  notifyListeners(timeUs, false);
  return ::OK;
}

void SliceAtEachIDRSource::notifyListeners(int64_t timeUs, bool slice) {
  for (size_t n = 0; n < mListeners.size(); ++n)
    mListeners[n]->handleProgressEvent(timeUs, slice);
}

class SliceAudioSource : public MediaSource, public SliceListener {
public:
  SliceAudioSource(const sp<MediaSource> &source);
  virtual ~SliceAudioSource();

  virtual status_t start(MetaData *params = NULL);
  virtual status_t stop();
  virtual sp<MetaData> getFormat();

  virtual status_t read(MediaBuffer **buffer, const ReadOptions *options);

  virtual void handleProgressEvent(int64_t timeUs, bool slice);
private:
  sp<PutBackWrapper> mSource;
  bool mStarted;
  int64_t mVideoTimeUs;
  Vector<int64_t> mVideoSliceTimes;
  Mutex mLock;
  Condition mWaitForProgress;

  DISALLOW_EVIL_CONSTRUCTORS(SliceAudioSource);
};

SliceAudioSource::SliceAudioSource(const sp<MediaSource> &source)
  : mSource(new PutBackWrapper(source)),
    mStarted(false),
    mVideoTimeUs(0)
{ }

SliceAudioSource::~SliceAudioSource()
{ }

status_t SliceAudioSource::start(MetaData *params) {
  if (mStarted) // don't start again
    return ::OK;
  mStarted = true;
  return mSource->start(params);
}

status_t SliceAudioSource::stop() {
  // we don't stop here since we start()/stop() repeatedly
  return ::OK;
}

sp<MetaData> SliceAudioSource::getFormat() {
  return mSource->getFormat();
}

status_t SliceAudioSource::read(MediaBuffer **buffer, const ReadOptions *options) {
  status_t err = mSource->read(buffer, options);
  if (err != ::OK) {
    // Stop the input stream here
    mSource->stop();
    return err;
  }

  int64_t timeUs, driftTimeUs;
  if (!(*buffer)->meta_data()->findInt64(kKeyTime, &timeUs))
    timeUs = 0;
  if (!(*buffer)->meta_data()->findInt64(kKeyDriftTime, &driftTimeUs))
    driftTimeUs = 0;

  // Make sure that video doesn't lag behind audio
  {
    Mutex::Autolock autoLock(mLock);

    while (timeUs > mVideoTimeUs) {
      mWaitForProgress.wait(mLock);
    }
  }

  // Check whether we have to slice the audio stream
  {
    Mutex::Autolock autoLock(mLock);

    // The audio data is sAudioChannels channels, 16-bit PCM with sAudioSampleRate
    int32_t usPerSample = 1000000 / sAudioSampleRate;
    int32_t frames = (*buffer)->range_length() / sAudioChannels / sizeof(int16_t);
    int32_t durationUs = frames * usPerSample;
    int64_t endUs = timeUs + durationUs;

    int64_t sliceTimeUs;
    while (mVideoSliceTimes.size() > 0 && (sliceTimeUs = mVideoSliceTimes[0]) < endUs) {
      // Is the whole buffer past the slice time?
      if (timeUs > sliceTimeUs) {
	// We have reached this slice time so remove it from the list
	mVideoSliceTimes.removeAt(0);
	// Put the buffer back. We will get here eventually. End the audio stream since
	// we are fully past the video stream.
	mSource->putBack(buffer);
	return ERROR_END_OF_STREAM;
      }

      // Is the slice time is within this buffer?
      if (sliceTimeUs >= timeUs && sliceTimeUs <= endUs) {
	int32_t prevFrames = (sliceTimeUs - timeUs) / usPerSample;
	int32_t nextFrames = frames - prevFrames;
	if (prevFrames) {
	  // Split the buffer in two and return the first half. Next iteration will
	  // end this stream. The other half goes back into the queue to be
	  // processed later.
	  MediaBuffer *dup = new MediaBuffer((*buffer)->data(), (*buffer)->size());
	  dup->meta_data()->setInt64(kKeyTime, sliceTimeUs);
	  dup->meta_data()->setInt64(kKeyDriftTime, driftTimeUs);
	  (*buffer)->set_range(0, prevFrames * sAudioChannels * sizeof(int16_t));
	  dup->set_range((*buffer)->range_length(), nextFrames * sAudioChannels * sizeof(int16_t));
	  mSource->putBack(&dup);
	  return ::OK;
	}
        // We have reached this slice time so remove it from the list
        mVideoSliceTimes.removeAt(0);
	// The buffer is fully in the new slice so just end the stream and return
	// the buffer to be picked up again shortly.
	mSource->putBack(buffer);
	return ERROR_END_OF_STREAM;
      }
    }
  }

  return ::OK;
}

void SliceAudioSource::handleProgressEvent(int64_t timeUs, bool slice)
{
  Mutex::Autolock autoLock(mLock);

  // Wake up the audio thread if its waiting for video to advance.
  mVideoTimeUs = timeUs;
  if (slice)
    mVideoSliceTimes.push(timeUs);
  mWaitForProgress.signal();
}

class IFrameRequestMonitor: public Thread {
  sp<MediaCodecSource> mEncoder;
public:
  IFrameRequestMonitor(sp<MediaCodecSource> encoder)
    : mEncoder(encoder) { }

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

class SlicedMP4Encoder : public Thread {
  Channel *mChannel;
  sp<ALooper> mLooper;
  sp<SliceAtEachIDRSource> mSlicedVideoSource;
  sp<SliceAudioSource> mSlicedAudioSource;
  sp<MediaCodecSource> mVideoEncoder;
  sp<AMessage> mAudioFormat;

public:
  SlicedMP4Encoder(sp<ALooper> looper, Channel *channel, sp<MediaSource> cameraSource);

  sp<MediaCodecSource> videoEncoder() { return mVideoEncoder; }

  virtual bool threadLoop();
};

SlicedMP4Encoder::SlicedMP4Encoder(sp<ALooper> looper, Channel *channel, sp<MediaSource> cameraSource)
  : mChannel(channel), mLooper(looper)
{
  // Setup video encoder
  sp<MetaData> meta = cameraSource->getFormat();
  int32_t width, height, stride, sliceHeight, colorFormat;
  CHECK(meta->findInt32(kKeyWidth, &width));
  CHECK(meta->findInt32(kKeyHeight, &height));
  CHECK(meta->findInt32(kKeyStride, &stride));
  CHECK(meta->findInt32(kKeySliceHeight, &sliceHeight));
  CHECK(meta->findInt32(kKeyColorFormat, &colorFormat));

  sp<AMessage> videoFormat = new AMessage();
  videoFormat->setInt32("width", width);
  videoFormat->setInt32("height", height);
  videoFormat->setInt32("stride", stride);
  videoFormat->setInt32("slice-height", sliceHeight);
  videoFormat->setInt32("color-format", colorFormat);

  videoFormat->setString("mime", kMimeTypeAvc);
  videoFormat->setInt32("bitrate", sVideoBitRateInK * 1024);
  videoFormat->setInt32("bitrate-mode", OMX_Video_ControlRateVariable);
  videoFormat->setFloat("frame-rate", sFPS);
  videoFormat->setInt32("i-frame-interval", sIFrameIntervalSec);

  mVideoEncoder = MediaCodecSource::Create(mLooper, videoFormat, cameraSource);

  // Setup audio
  sp<MediaSource> audioSource = new AudioSource(AUDIO_SOURCE_MIC,
						sAudioSampleRate,
						sAudioChannels);

  int32_t maxInputSize, channels, sampleRate, bitrate;
  CHECK(audioSource->getFormat()->findInt32(kKeyMaxInputSize, &maxInputSize));
  CHECK(audioSource->getFormat()->findInt32(kKeySampleRate, &sampleRate));
  CHECK(audioSource->getFormat()->findInt32(kKeyChannelCount, &channels));

  mAudioFormat = new AMessage();
  mAudioFormat->setString("mime", MEDIA_MIMETYPE_AUDIO_AAC);
  mAudioFormat->setInt32("aac-profile", OMX_AUDIO_AACObjectLC);
  mAudioFormat->setInt32("max-input-size", maxInputSize);
  mAudioFormat->setInt32("sample-rate", sampleRate);
  mAudioFormat->setInt32("channel-count", channels);
  mAudioFormat->setInt32("bitrate", sAudioBitRate);

  mSlicedVideoSource = new SliceAtEachIDRSource(mVideoEncoder);
  mSlicedAudioSource = new SliceAudioSource(audioSource);

  // The video stream drives where the audio stream is sliced
  mSlicedVideoSource->addListener(mSlicedAudioSource.get());
}

bool SlicedMP4Encoder::threadLoop() {
  while (true) {
    sp<MPEG4MemoryWriter> writer = new MPEG4MemoryWriter();

    writer->addSource(mSlicedVideoSource);

    // Turn off audio until we sort out timing and performance issues on iOS
    #if 0
    sp<MediaCodecSource> audioEncoder =
      MediaCodecSource::Create(mLooper, mAudioFormat, mSlicedAudioSource);

    writer->addSource(audioEncoder);
    #endif

    sp<MetaData> params = new MetaData();
    params->setInt32(kKeyFileType, OUTPUT_FORMAT_MPEG_4);
    params->setInt32(kKeyRealTimeRecording, false);

    timeval when;
    gettimeofday(&when, NULL);

    CHECK_EQ(writer->start(params.get()), ::OK);
    writer->waitForEOS();
    status_t err = writer->stop();
    if (err == ::OK) {
      // Write size and .mp4 data to stdout
      mChannel->send(TAG_VIDEO, when, writer->data().array(), writer->data().size());
    } else {
      ALOGW("MPEG4MemoryWriter stop failed with %d. No video data sent", err);
    }

    writer = NULL;
  }
}

class FaceDetection : public CameraListener {
  Channel *mChannel;
public:
  FaceDetection(Channel *channel);

  void notify(int32_t msgType, int32_t ext1, int32_t ext2);
  void postData(int32_t msgType, const sp<IMemory>& dataPtr,
                camera_frame_metadata_t *metadata);
  void postDataTimestamp(nsecs_t timestamp, int32_t msgType,
			 const sp<IMemory>& dataPtr);
};

FaceDetection::FaceDetection(Channel *channel)
  : mChannel(channel) { }

void FaceDetection::notify(int32_t msgType, int32_t ext1, int32_t ext2) {
  (void)msgType;
  (void)ext1;
  (void)ext2;
}

void FaceDetection::postData(int32_t msgType, const sp<IMemory>& dataPtr,
			     camera_frame_metadata_t *metadata) {
  (void)dataPtr;
  if ((CAMERA_MSG_PREVIEW_METADATA & msgType) && metadata) {
    mChannel->send(TAG_FACES, metadata->faces, sizeof(camera_face_t) * metadata->number_of_faces);
  }
}

void FaceDetection::postDataTimestamp(nsecs_t timestamp, int32_t msgType,
				      const sp<IMemory>& dataPtr)
{
  (void)timestamp;
  (void)msgType;
  (void)dataPtr;
}

/**
 * This class provided a method that is run each time
 * {@code CAPTURE_COMMAND_NAME} is received from node over the socket
 */
class CaptureCommand: public FrameworkCommand {
public:
  CaptureCommand(CaptureListener* captureListener) :
      FrameworkCommand(CAPTURE_COMMAND_NAME),
      mCaptureListener(captureListener),
      mHardwareActive(false) {
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
};

/**
 * This class provides a wrapper around capture socket to help with
 * sending and receiving messages using the capture socket.
 */
class CaptureListener: private FrameworkListener {
public:
  CaptureListener() :
      FrameworkListener(CAPTURE_CTL_SOCKET_NAME) {
    FrameworkListener::registerCmd(new CaptureCommand(this));
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
    std::string jsonMessage = fastWriter.write(jsonMsg);

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

  std::string cmdName = cmdNameVal.asString();
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
 *
 */
void* CaptureCommand::initThreadWrapper(void* me) {
  CaptureCommand* command = static_cast<CaptureCommand *>(me);
  command->initThread();
  return NULL;
}

/**
 *
 */
status_t CaptureCommand::initThread() {
  mLooper = new ALooper;
  mLooper->setName("capture-looper");
  mLooper->start();

  Channel chan;

  // Create a preview surface
  mSCClient = new SurfaceComposerClient();
  if (mSCClient.get() == NULL) {
    ALOGE("Unable to establish connection to Surface Composer");
    return -1;
  }
  mSurfaceControl = mSCClient->createSurface(String8(CAMERA_NAME), sVideoSize.width,
      sVideoSize.height, PIXEL_FORMAT_RGBX_8888, 0);
  if (mSurfaceControl.get() == NULL) {
    ALOGE("Unable to create preview surface");
    return -1;
  }
  mPreviewSurface = mSurfaceControl->getSurface();

  // Setup the camera
  int cameraId = 0;
  mCamera = Camera::connect(cameraId, String16(CAMERA_NAME), Camera::USE_CALLING_UID);
  if (mCamera == NULL) {
    ALOGE("Unable to connect to camera");
    return -1;
  }
  mRemote = mCamera->remote();
  mProxy = mCamera->getRecordingProxy();

  FaceDetection faces(&chan);
  mCamera->setListener(&faces);

  CHECK(mCamera->setPreviewTarget(mPreviewSurface->getIGraphicBufferProducer()) == 0);
  CHECK(mCamera->startPreview() == 0);
  CHECK(mCamera->previewEnabled());
  CHECK(mCamera->sendCommand(CAMERA_CMD_START_FACE_DETECTION, CAMERA_FACE_DETECTION_SW, 0) == 0);

  // Start recording stream
  mCameraSource =
    CameraSource::CreateFromCamera(mRemote, mProxy, cameraId, String16(CAMERA_NAME, strlen(CAMERA_NAME)),
           Camera::USE_CALLING_UID, sVideoSize, sFPS,
           NULL);
  CHECK_EQ(mCameraSource->initCheck(), ::OK);

  mHardwareActive = true;

  sp<ProcessState> proc(ProcessState::self());
  ProcessState::self()->startThreadPool();

  mPreview = new PreviewMediaSource(&chan, mCameraSource, sPreviewSkipCount);
  mMp4 = new SlicedMP4Encoder(mLooper, &chan, mPreview);
  mMp4->run();

  mIframe = new IFrameRequestMonitor(mMp4->videoEncoder());
  mMp4->join();

  return 0;
}

/**
 * Stop camera preview
 */
int CaptureCommand::capture_cleanup() {
  ALOGV("%s", __FUNCTION__);

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
    if (NULL != mCamera.get() ) {
      mCamera->disconnect();
      mCamera.clear();
    }
  }
  mHardwareActive = false;
  return 0;
}

int main(int argc, char **argv) {
  (void) argc;
  (void) argv;

  // Start the server socket and register for commands from camera node module
  CaptureListener captureListener;
  int err = captureListener.start();
  if (err < 0) {
    ALOGE("Failed to start capture ctl socket listener: %d\n", err);

    Value jsonMsg; \
    jsonMsg["eventName"] = "error"; \
    captureListener.sendEvent(jsonMsg); \
    return 1;
  }

  while (1) {
    sleep(INT_MAX);
  }

  return 0;
}
