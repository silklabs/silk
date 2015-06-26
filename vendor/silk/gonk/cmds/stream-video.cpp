#include <binder/ProcessState.h>
#include <media/stagefright/foundation/ABuffer.h>
#include <media/stagefright/foundation/AMessage.h>
#include <media/stagefright/foundation/ADebug.h>
#include <media/stagefright/AudioSource.h>
#include <media/stagefright/CameraSource.h>
#include <media/stagefright/MediaDefs.h>
#include <media/stagefright/MetaData.h>
#include <media/stagefright/MediaCodec.h>
#include <media/stagefright/MediaCodecSource.h>
#include <media/stagefright/OMXCodec.h>
#include <media/MediaProfiles.h>
#include <gui/Surface.h>
#include <gui/SurfaceComposerClient.h>
#include <include/avc_utils.h>
#include <setjmp.h>

#include "MPEG4MemoryWriter.h"

extern "C" {
#include "jpeglib.h"
}

using namespace android;

static const char* kMimeTypeAvc = "video/avc";
static Size kVideoSize(1280, 720);
static int32_t kVideoBitRate = 2096 * 1024;
static int32_t kAudioBitRate = 32000;
static int32_t kFPS = 24;
static int32_t kIFramesIntervalSec = 1;
static int32_t kAudioSampleRate = 8000;
static int32_t kUsPerSample = 1000000 / kAudioSampleRate;
static int32_t kAudioChannels = 1;

static status_t OK = static_cast<status_t>(android::OK);

static bool sDebug = false;
static bool sPreview = true;
static bool sVideo = false;

#define TAG_VIDEO 0
#define TAG_PREVIEW 1

class Channel {
  Mutex mLock;

  void send(const void *data, size_t size);

  template <typename T>
  void send(T value) {
    send(&value, sizeof(T));
  }
public:
  void send(int32_t tag, const void *data, size_t size);
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

void Channel::send(int32_t tag, const void *data, size_t size) {
  Mutex::Autolock autoLock(mLock);

  send(int32_t(size));
  send(int32_t(tag));
  send(data, size);
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

static int kPreviewScale = 4;

void PreviewMediaSource::snapshot(MediaBuffer* img) {
  sp<MetaData> meta = mSource->getFormat();
  int32_t width, height, stride, sliceHeight, colorFormat;
  CHECK(meta->findInt32(kKeyWidth, &width));
  CHECK(meta->findInt32(kKeyHeight, &height));
  CHECK(meta->findInt32(kKeyStride, &stride));
  CHECK(meta->findInt32(kKeySliceHeight, &sliceHeight));
  CHECK(meta->findInt32(kKeyColorFormat, &colorFormat));

  int32_t imageWidth = width/kPreviewScale;
  int32_t imageHeight = height/kPreviewScale;

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
    int32_t ycbcr_row = row * kPreviewScale;
    const uint8_t *y_row = y_plane + ycbcr_row * stride;
    const uint8_t *cbcr_row = cbcr_plane + (ycbcr_row / 2) * stride;
    for (int x = 0; x < imageWidth; x++) {
      int32_t ycbcr_x = x * kPreviewScale;
      buffer[x*3+0] = y_row[ycbcr_x];
      buffer[x*3+1] = cbcr_row[(ycbcr_x&(~1))];
      buffer[x*3+2] = cbcr_row[(ycbcr_x&(~1))+1];
    }
    JSAMPROW rowptr = reinterpret_cast<JSAMPROW>(buffer);
    jpeg_write_scanlines(cinfo, &rowptr, 1);
  }

  jpeg_finish_compress(cinfo);
  jpeg_destroy_compress(cinfo);

  int32_t size = state.buffer.size();
  if (sDebug) {
    printf("jpeg: %d\n", size);
  } else if (sPreview) {
    mChannel->send(TAG_PREVIEW, state.buffer.begin(), size);
  }
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

  bool reachedEOS() const { return mDone; }

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

  bool reachedEOS() const { return mSource->reachedEOS(); }

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

  bool reachedEOS() const { return mSource->reachedEOS(); }

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

    // The audio data is kAudioChannels channels, 16-bit PCM with kAudioSampleRate
    int32_t frames = (*buffer)->range_length() / kAudioChannels / sizeof(int16_t);
    int32_t durationUs = frames * kUsPerSample;
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
	int32_t prevFrames = (sliceTimeUs - timeUs) / kUsPerSample;
	int32_t nextFrames = frames - prevFrames;
	if (prevFrames) {
	  // Split the buffer in two and return the first half. Next iteration will
	  // end this stream. The other half goes back into the queue to be
	  // processed later.
	  MediaBuffer *dup = new MediaBuffer((*buffer)->data(), (*buffer)->size());
	  dup->meta_data()->setInt64(kKeyTime, sliceTimeUs);
	  dup->meta_data()->setInt64(kKeyDriftTime, driftTimeUs);
	  (*buffer)->set_range(0, prevFrames * kAudioChannels * sizeof(int16_t));
	  dup->set_range((*buffer)->range_length(), nextFrames * kAudioChannels * sizeof(int16_t));
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

class SlicedMP4Encoder {
  Channel *mChannel;
  sp<SliceAtEachIDRSource> mSlicedVideoSource;
  sp<SliceAudioSource> mSlicedAudioSource;
public:
  SlicedMP4Encoder(Channel *channel);

  void init(sp<ALooper> looper, sp<MediaSource> cameraSource);
  void run();
};

SlicedMP4Encoder::SlicedMP4Encoder(Channel *channel)
  : mChannel(channel)
{ }

void SlicedMP4Encoder::init(sp<ALooper> looper, sp<MediaSource> cameraSource) {
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
  videoFormat->setInt32("bitrate", kVideoBitRate);
  videoFormat->setInt32("bitrate-mode", OMX_Video_ControlRateConstant);
  videoFormat->setFloat("frame-rate", kFPS);
  videoFormat->setInt32("i-frame-interval", kIFramesIntervalSec);

  sp<MediaCodecSource> videoEncoder =
    MediaCodecSource::Create(looper, videoFormat, cameraSource);

  // Setup audio
  sp<MediaSource> audioSource = new AudioSource(AUDIO_SOURCE_MIC,
						kAudioSampleRate,
						kAudioChannels);

  int32_t maxInputSize, channels, sampleRate, bitrate;
  CHECK(audioSource->getFormat()->findInt32(kKeyMaxInputSize, &maxInputSize));
  CHECK(audioSource->getFormat()->findInt32(kKeySampleRate, &sampleRate));
  CHECK(audioSource->getFormat()->findInt32(kKeyChannelCount, &channels));

  sp<AMessage> audioFormat = new AMessage();
  audioFormat->setString("mime", MEDIA_MIMETYPE_AUDIO_AAC);
  audioFormat->setInt32("aac-profile", OMX_AUDIO_AACObjectLC);
  audioFormat->setInt32("max-input-size", maxInputSize);
  audioFormat->setInt32("sample-rate", sampleRate);
  audioFormat->setInt32("channel-count", channels);
  audioFormat->setInt32("bitrate", kAudioBitRate);

  mSlicedVideoSource = new SliceAtEachIDRSource(videoEncoder);
  mSlicedAudioSource = new SliceAudioSource(audioSource);

  // The video stream drives where the audio stream is sliced
  mSlicedVideoSource->addListener(mSlicedAudioSource.get());
}

void SlicedMP4Encoder::run() {
  while (!mSlicedVideoSource->reachedEOS()) {
    sp<MPEG4MemoryWriter> writer = new MPEG4MemoryWriter();

    writer->addSource(mSlicedVideoSource);

#if 0 // disable audio
    sp<MediaCodecSource> audioEncoder =
      MediaCodecSource::Create(looper, audioFormat, slicedAudioSource);

    writer->addSource(audioEncoder);
#endif

    sp<MetaData> params = new MetaData();
    params->setInt32(kKeyFileType, OUTPUT_FORMAT_MPEG_4);
    params->setInt32(kKeyRealTimeRecording, false);
    CHECK_EQ(writer->start(params.get()), ::OK);

    while (!writer->reachedEOS())
      ;

    CHECK_EQ(writer->stop(), ::OK);

    // Write size and .mp4 data to stdout
    int32_t size = writer->data().size();
    if (sDebug) {
      printf("video: %d\n", size);
    } else if (sVideo) {
      mChannel->send(TAG_VIDEO, writer->data().array(), size);
    }

    writer = NULL;
  }
}

int main(int argc, char **argv) {
  for (int i = 1; i < argc; ++i) {
    if (!strcmp(argv[i], "-d"))
      sDebug = true;
    if (!strcmp(argv[i], "-v"))
      sVideo = true;
  }

  android::ProcessState::self()->startThreadPool();

  sp<ALooper> looper = new ALooper;
  looper->setName("stream-video-looper");
  looper->start();

  Channel chan;

  // Create a preview surface
  sp<SurfaceComposerClient> scc = new SurfaceComposerClient();
  if (scc.get() == NULL) {
    ALOGE("Unable to establish connection to Surface Composer");
    return -1;
  }
  sp<SurfaceControl> sc =
    scc->createSurface(String8(argv[0]),
		       kVideoSize.width, kVideoSize.height,
		       PIXEL_FORMAT_RGBX_8888, 0);
  if (sc.get() == NULL) {
    ALOGE("Unable to create preview surface");
    return -1;
  }
  sp<Surface> previewSurface = sc->getSurface();

  // Setup camera
  int cameraId = 0;
  sp<Camera> camera = Camera::connect(cameraId, String16(argv[0]), Camera::USE_CALLING_UID);
  sp<ICamera> remote = camera->remote();
  sp<ICameraRecordingProxy> proxy;
  sp<CameraSource> cameraSource =
    CameraSource::CreateFromCamera(remote, proxy, cameraId, String16(argv[0], strlen(argv[0])),
				   Camera::USE_CALLING_UID, kVideoSize, kFPS,
				   previewSurface->getIGraphicBufferProducer());
  CHECK_EQ(cameraSource->initCheck(), ::OK);

  sp<PreviewMediaSource> preview = new PreviewMediaSource(&chan, cameraSource, 0);

  SlicedMP4Encoder mp4(&chan);
  mp4.init(looper, preview);
  mp4.run();

  return 0;
}
