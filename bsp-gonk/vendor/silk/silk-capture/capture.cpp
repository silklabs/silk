/**
 * Provides a simple video capture class tailored to the needs of silk-capture.js
 *
 * libpreview is used as the backend for bsp-gonk, while the OpenCV
 * VideoCapture API is used for other targets.
 */

//#define LOG_NDEBUG 0
#define LOG_TAG "silk-capture"
#include <log/log.h>

#ifdef USE_LIBPREVIEW
#include <libpreview.h>
#endif

#include <memory>
#include <nan.h>
#include "Matrix.h"
#include <opencv/highgui.h>

#if CV_MAJOR_VERSION >= 3
#include <opencv2/imgproc.hpp>
#include <opencv2/videoio.hpp>
#endif

using std::string;

#define OBJECT_FROM_ARGS(NAME, IND) \
  if (info[IND]->IsObject()) { \
    NAME = info[IND]->ToObject(); \
  } else { \
    Nan::ThrowTypeError("Argument not of expected format"); \
  } \

#define INT_FROM_ARGS(NAME, IND) \
  if (info[IND]->IsInt32()) { \
    NAME = info[IND]->Uint32Value(); \
  }

#define STRING_FROM_ARGS(NAME, IND) \
  if (info[IND]->IsString()) { \
    NAME = string(*Nan::Utf8String(info[IND]->ToString())); \
  }

////
// Holds the current state of a VideoCapture session
class State {
public:
  int deviceId;
  int scaledWidth;
  int scaledHeight;
  bool busy;
#ifdef USE_LIBPREVIEW
  libpreview::Client *client;
  libpreview::FrameFormat frameFormat;
  uv_mutex_t frameDataLock;
  int frameWidth;
  int frameHeight;
  void *frameBuffer;
  libpreview::FrameOwner frameOwner;
#else
  cv::VideoCapture cap;
#endif

  State(int deviceId, int scaledWidth, int scaledHeight)
    : deviceId(deviceId),
      scaledWidth(scaledWidth),
      scaledHeight(scaledHeight),
      busy(true),
#ifdef USE_LIBPREVIEW
      frameWidth(0),
      frameHeight(0),
      frameBuffer(nullptr),
#endif
      opened(false) {
#ifdef USE_LIBPREVIEW
    uv_mutex_init(&frameDataLock);
#endif
  }

  bool open() {
    if (opened) {
      ALOGE("State already open");
      return true;
    }

    if (!busy) {
      ALOGE("State should be busy during open");
      return true;
    }

#ifdef USE_LIBPREVIEW
    client = libpreview::open(OnFrameCallback, OnAbandonedCallback, this);
    opened = client != NULL;
#else
    cap.open(deviceId);
    opened = cap.isOpened();
#endif
    if (opened) {
      busy = false;
    } else {
      ALOGE("Failed to open capture source");
    }
    return opened;
  }

  ~State() {
    shutdown();
#ifdef USE_LIBPREVIEW
    uv_mutex_destroy(&frameDataLock);
#endif
  }

  void shutdown() {
#ifdef USE_LIBPREVIEW
    if (client != NULL) {
      client->stopFrameCallback();

      // Null client while holding frameDataLock, to ensure that another thread
      // isn't sitting in OnFrameCallback() when libpreview is closed
      uv_mutex_lock(&frameDataLock);
      auto localclient = client;
      client = NULL;
      uv_mutex_unlock(&frameDataLock);

      // Release the current frameBuffer
      uv_mutex_lock(&frameDataLock);
      if (frameBuffer != NULL) {
        localclient->releaseFrame(frameOwner);
        frameBuffer = NULL;
      }
      uv_mutex_unlock(&frameDataLock);

      // Shutdown calls to OnFrameCallback and/or OnAbandonedCallback
      localclient->release();

      // Grab then release frameDataLock again, to ensure that a thread didn't
      // sneak into OnFrameCallback() before localclient was really deleted.
      uv_mutex_lock(&frameDataLock);
      uv_mutex_unlock(&frameDataLock);
      ALOGI("Shutdown complete");
    }
#else
    cap.release();
#endif
  }

private:
  bool opened;

#ifdef USE_LIBPREVIEW
  static void OnAbandonedCallback(void *userData);
  static void OnFrameCallback(libpreview::Frame& frame);
#endif
};


/*
 * Implements the 'VideoCapture' Javascript class
 */
class VideoCapture: public Nan::ObjectWrap {
friend class VideoCaptureFrameWorker;
friend class VideoCaptureCustomFrameWorker;
public:
  static void Init(v8::Local<v8::Object> exports);

private:
  explicit VideoCapture(State *state): state(state) {}
  ~VideoCapture() {}
  static void New(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void ReadRgb(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void ReadCustom(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static void Close(const Nan::FunctionCallbackInfo<v8::Value>& info);
  static Nan::Persistent<v8::Function> constructor;

  std::shared_ptr<State> state;
};


class VideoCaptureOpenWorker : public Nan::AsyncWorker {
 public:
  explicit VideoCaptureOpenWorker(std::weak_ptr<State> weakState,
                                  Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      weakState(weakState) {}
  virtual ~VideoCaptureOpenWorker() {}

  void Execute() {
    auto state = weakState.lock();
    if (state) {
      if (!state->open()) {
        SetErrorMessage("Unable to open camera");
      }
    }
  }

 private:
  std::weak_ptr<State> weakState;
};


static void convertYUVsptoYVUsp(int width, int height, const cv::Mat& yuv, cv::Mat& yvu) {
  yvu = yuv.clone();

  const size_t yPlaneSize = width * height;
  const size_t uvPlaneSize = yPlaneSize / 2;

  // Copy/convert UV plane into VU plane, 32bits at a time.
  // (TODO: Use 64bits at a time if this is a arm64 build and/or just use neon)
  const uint32_t *s = static_cast<const uint32_t *>((void *)(yuv.ptr(0) + yPlaneSize));
  uint32_t *d = static_cast<uint32_t *>((void *)(yvu.ptr(0) + yPlaneSize));
  for (uint32_t *dEnd = d + uvPlaneSize / 4; d < dEnd; s++, d++) {
    const uint32_t v = *s;
    *d = (v << 8) | (v >> 24);
  }
}

#ifdef USE_LIBPREVIEW
static void *packVenusBuffer(void *buffer, int width, int height) {
  auto yPlaneSize = width * height;

  // TODO: This extra buffer copy for Venus buffers is not super
  auto packedBuffer = malloc(yPlaneSize * 3 / 2);

  // Y plane is unmodified
  memcpy(packedBuffer, buffer, yPlaneSize);

  // pack the VU plane
  memcpy(
    static_cast<char *>(packedBuffer) + yPlaneSize,
    static_cast<char *>(buffer) +
      libpreview::VENUS_C_PLANE_OFFSET(width, height),
    yPlaneSize / 2
  );

  return packedBuffer;
}
#endif

/*
 * Async worker used to process the next frame
 */
class VideoCaptureFrameWorker : public Nan::AsyncWorker {
public:
  explicit VideoCaptureFrameWorker(std::weak_ptr<State> weakState,
                                   v8::Local<v8::Object> imRGB,
                                   Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      weakState(weakState) {
    destRGB.Reset(imRGB);
  }
  virtual ~VideoCaptureFrameWorker() {}

  void Execute() {
    auto state = weakState.lock();
    if (!state) {
      SetErrorMessage("Camera gone");
      return;
    }

#ifdef USE_LIBPREVIEW
    if (state->frameBuffer == NULL) {
      SetErrorMessage("no frame yet");
      return;
    }
    uv_mutex_lock(&state->frameDataLock);
    auto frameBuffer = state->frameBuffer;

    if (state->frameFormat == libpreview::FRAMEFORMAT_YUV420SP_VENUS ||
        state->frameFormat == libpreview::FRAMEFORMAT_YVU420SP_VENUS) {
      frameBuffer = packVenusBuffer(
        state->frameBuffer,
        state->frameWidth,
        state->frameHeight
      );
    }

    switch (state->frameFormat) {
    case libpreview::FRAMEFORMAT_YUV420SP_VENUS:
    case libpreview::FRAMEFORMAT_YUV420SP:
      {
        cv::Mat remote(
          state->frameHeight * 3 / 2,
          state->frameWidth,
          CV_8UC1,
          frameBuffer
        );
        cv::cvtColor(remote, rgb, CV_YUV420sp2RGB, 0);
        break;
      }
    case libpreview::FRAMEFORMAT_YVU420SP_VENUS:
    case libpreview::FRAMEFORMAT_YVU420SP:
      {
        cv::Mat remote(
          state->frameHeight * 3 / 2,
          state->frameWidth,
          CV_8UC1,
          frameBuffer
        );

        cv::Mat yuv;
        convertYUVsptoYVUsp(state->frameWidth, state->frameHeight, remote, yuv);
        cv::cvtColor(yuv, rgb, CV_YUV420sp2RGB, 0);
        break;
      }
    case libpreview::FRAMEFORMAT_RGB:
      {
        rgb = cv::Mat(
          state->frameHeight,
          state->frameWidth,
          CV_8UC3,
          frameBuffer
        ).clone();
        break;
      }
    default:
      ALOGE("Warning: Unknown frame format: %d\n", state->frameFormat);
      break;
    }
    if (frameBuffer != state->frameBuffer) {
      free(frameBuffer);
    }
    uv_mutex_unlock(&state->frameDataLock);
#else
    if (!state->cap.grab()) {
      SetErrorMessage("grab failed");
      return;
    }
    cv::Mat remote;
    if (!state->cap.retrieve(remote)) {
      SetErrorMessage("retrieve failed");
      return;
    }
    cv::cvtColor(remote, rgb, CV_BGR2RGB, 0);
#endif
  }

  void HandleErrorCallback() {
    auto state = weakState.lock();
    if (state) {
      state->busy = false;
      Nan::AsyncWorker::HandleErrorCallback();
    }
  }

  void HandleOKCallback() {
    auto state = weakState.lock();
    if (state) {
      state->busy = false;

      Nan::HandleScope scope;
      node_opencv::Matrix *mat;

      v8::Local<v8::Object> localRGB = Nan::New(destRGB);
      mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(localRGB);
      mat->mat = rgb;
      destRGB.Reset();
      Nan::AsyncWorker::HandleOKCallback();
    }
  }

private:
  cv::Mat rgb;
  Nan::Persistent<v8::Object> destRGB;
  std::weak_ptr<State> weakState;
  bool grabAll;
};


/*
 * Async worker used to process the next custom frame
 */
class VideoCaptureCustomFrameWorker : public Nan::AsyncWorker {
public:
  explicit VideoCaptureCustomFrameWorker(std::weak_ptr<State> weakState,
                                   v8::Local<v8::Object> im,
                                   string format,
                                   int width,
                                   int height,
                                   Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      weakState(weakState),
      format(format),
      width(width),
      height(height) {
    destIm.Reset(im);
  }
  virtual ~VideoCaptureCustomFrameWorker() {}

  void Execute() {
    auto state = weakState.lock();
    if (!state) {
      SetErrorMessage("Camera gone");
      return;
    }

    if (format != "yvu420sp" && format != "rgb" && format != "bgr") {
      SetErrorMessage("unknown custom preview format");
      return;
    }

#ifdef USE_LIBPREVIEW
    if (state->frameBuffer == NULL) {
      SetErrorMessage("no frame yet");
      return;
    }
    uv_mutex_lock(&state->frameDataLock);
    auto frameBuffer = state->frameBuffer;

    if (state->frameFormat == libpreview::FRAMEFORMAT_YUV420SP_VENUS ||
        state->frameFormat == libpreview::FRAMEFORMAT_YVU420SP_VENUS) {
      frameBuffer = packVenusBuffer(
        state->frameBuffer,
        state->frameWidth,
        state->frameHeight
      );
    }

    switch (state->frameFormat) {
    case libpreview::FRAMEFORMAT_YUV420SP_VENUS:
    case libpreview::FRAMEFORMAT_YUV420SP:
      {
        cv::Mat remote(
          state->frameHeight * 3 / 2,
          state->frameWidth,
          CV_8UC1,
          frameBuffer
        );

        if (format == "yvu420sp") {
          convertYUVsptoYVUsp(state->frameWidth, state->frameHeight, remote, im);
        } else if (format == "rgb") {
          cv::cvtColor(remote, im, CV_YUV420sp2RGB, 0);
        } else if (format == "bgr") {
          cv::cvtColor(remote, im, CV_YUV420sp2BGR, 0);
        }
        break;
      }

    case libpreview::FRAMEFORMAT_YVU420SP_VENUS:
    case libpreview::FRAMEFORMAT_YVU420SP:
      {
        cv::Mat remote(
          state->frameHeight * 3 / 2,
          state->frameWidth,
          CV_8UC1,
          frameBuffer
        );

        if (format == "yvu420sp") {
          im = remote.clone();
        } else {
          cv::Mat yuv;
          convertYUVsptoYVUsp(state->frameWidth, state->frameHeight, remote, yuv);
          if (format == "rgb") {
            cv::cvtColor(yuv, im, CV_YUV420sp2RGB, 0);
          } else if (format == "bgr") {
            cv::cvtColor(yuv, im, CV_YUV420sp2BGR, 0);
          }
        }
        break;
      }
    case libpreview::FRAMEFORMAT_RGB:
      {
        cv::Mat remote(
            state->frameHeight,
            state->frameWidth,
            CV_8UC3,
            state->frameBuffer
        );
        if (format == "yvu420sp") {
          cv::Mat yuv;
          cv::cvtColor(remote, yuv, CV_RGB2YUV, 0);
          convertYUVsptoYVUsp(state->frameWidth, state->frameHeight, yuv, im);
        } else if (format == "rgb") {
          im = remote.clone();
        } else if (format == "bgr") {
          cv::cvtColor(remote, im, CV_RGB2BGR, 0);
        }
        break;
      }
    default:
      ALOGE("Warning: Unknown frame format: %d\n", state->frameFormat);
      break;
    }
    if (frameBuffer != state->frameBuffer) {
      free(frameBuffer);
    }
    uv_mutex_unlock(&state->frameDataLock);
#else
    if (!state->cap.grab()) {
      SetErrorMessage("grab failed");
      return;
    }
    cv::Mat remote;
    if (!state->cap.retrieve(remote)) {
      SetErrorMessage("retrieve failed");
      return;
    }
    if (format == "yvu420sp") {
      cv::Mat yuv;
      cv::cvtColor(remote, yuv, CV_BGR2YUV, 0);
      cv::Size s = yuv.size();
      convertYUVsptoYVUsp(s.width, s.height, yuv, im);
    } else if (format == "rgb") {
      cv::cvtColor(remote, im, CV_BGR2RGB, 0);
    } else if (format == "bgr") {
      im = remote;
    }
#endif
    cv::Size s = im.size();
    if ((width != s.width) ||
        (height != (format == "yvu420sp" ? s.height / 3 * 2 : s.height))) {
        // height in yuv420sp is not correct; adjust when comparing
      if (format == "yvu420sp") {
        SetErrorMessage("Cannot resize in yvu420sp");
        return;
      } else {
        cv::resize(im, im, cv::Size(width, height), 0, 0, cv::INTER_LINEAR);
      }
    }
  }

  void HandleErrorCallback() {
    auto state = weakState.lock();
    if (state) {
      state->busy = false;
      Nan::AsyncWorker::HandleErrorCallback();
    }
  }

  void HandleOKCallback() {
    auto state = weakState.lock();
    if (state) {
      state->busy = false;
      Nan::HandleScope scope;
      node_opencv::Matrix *mat;

      v8::Local<v8::Object> localIm = Nan::New(destIm);
      mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(localIm);
      mat->mat = im;
      destIm.Reset();

      Nan::AsyncWorker::HandleOKCallback();
    }
  }

private:
  cv::Mat im;

  Nan::Persistent<v8::Object> destIm;
  std::weak_ptr<State> weakState;
  string format;
  int width;
  int height;
};


class VideoCaptureCloseWorker : public Nan::AsyncWorker {
 public:
  explicit VideoCaptureCloseWorker(std::shared_ptr<State> state,
                                   Nan::Callback *callback)
    : Nan::AsyncWorker(callback),
      state(state) {}
  virtual ~VideoCaptureCloseWorker() {}

  void Execute() {
    state->shutdown();
  }

 private:
  std::shared_ptr<State> state;
};

Nan::Persistent<v8::Function> VideoCapture::constructor;

void VideoCapture::Init(v8::Local<v8::Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
  tpl->SetClassName(Nan::New("VideoCapture").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetPrototypeMethod(tpl, "readRgb", ReadRgb);
  Nan::SetPrototypeMethod(tpl, "readCustom", ReadCustom);
  Nan::SetPrototypeMethod(tpl, "close", Close);

  constructor.Reset(tpl->GetFunction());
  exports->Set(Nan::New("VideoCapture").ToLocalChecked(), tpl->GetFunction());
}

NAN_METHOD(VideoCapture::New) {
  if (!info.IsConstructCall()) {
    // Invoked as plain function `VideoCapture(...)`, turn into construct call.
    const int argc = 4;
    v8::Local<v8::Value> argv[argc] = { info[0], info[1], info[2], info[3] };
    v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance(argc, argv));
    return;
  }

  // Invoked as constructor: `new VideoCapture(deviceId,  )`

  if (info.Length() < 4 ||
      !info[0]->IsInt32() ||
      !info[1]->IsInt32() ||
      !info[2]->IsInt32() ||
      !info[3]->IsFunction()) {
    Nan::ThrowTypeError("VideoCapture expects four arguments: "
      "deviceId, scaledWidth, scaledHeight, callback");
    return;
  }

  int deviceId = info[0]->ToInt32()->Value();
  int scaledWidth = info[1]->ToInt32()->Value();
  int scaledHeight = info[2]->ToInt32()->Value();
  Nan::Callback *callback = NULL;
  callback = new Nan::Callback(info[3].As<v8::Function>());

  State *state = new State(deviceId, scaledWidth, scaledHeight);
  VideoCapture* self = new VideoCapture(state);
  self->Wrap(info.This());

  Nan::AsyncQueueWorker(new VideoCaptureOpenWorker(self->state, callback));
  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(VideoCapture::ReadRgb) {
  VideoCapture* self = ObjectWrap::Unwrap<VideoCapture>(info.Holder());

  if (!self->state || self->state->busy) {
    Nan::ThrowError("Busy");
    return;
  }

  if (info.Length() != 2) {
    Nan::ThrowError("Insufficient number of arguments provided");
  }

  v8::Local<v8::Object> imRGB;
  Nan::Callback *callback = NULL;

  OBJECT_FROM_ARGS(imRGB, 0);
  callback = new Nan::Callback(info[1].As<v8::Function>());

  self->state->busy = true;
  Nan::AsyncQueueWorker(
    new VideoCaptureFrameWorker(
      self->state,
      imRGB,
      callback
    )
  );
}

NAN_METHOD(VideoCapture::ReadCustom) {
  VideoCapture* self = ObjectWrap::Unwrap<VideoCapture>(info.Holder());

  if (!self->state || self->state->busy) {
    Nan::ThrowError("Busy");
    return;
  }

  if (info.Length() != 5) {
    Nan::ThrowError("Insufficient number of arguments provided");
  }

  v8::Local<v8::Object> im;
  Nan::Callback *callback = NULL;
  string format;
  int width = 0;
  int height = 0;

  OBJECT_FROM_ARGS(im, 0);
  STRING_FROM_ARGS(format, 1);
  INT_FROM_ARGS(width, 2);
  INT_FROM_ARGS(height, 3);
  callback = new Nan::Callback(info[4].As<v8::Function>());

  self->state->busy = true;
  Nan::AsyncQueueWorker(
    new VideoCaptureCustomFrameWorker(
      self->state,
      im,
      format,
      width,
      height,
      callback
    )
  );
}

NAN_METHOD(VideoCapture::Close) {
  VideoCapture* self = ObjectWrap::Unwrap<VideoCapture>(info.Holder());

  if (info.Length() != 1) {
    Nan::ThrowError("Insufficient number of arguments provided");
  }

  Nan::Callback *callback = NULL;
  callback = new Nan::Callback(info[0].As<v8::Function>());

  auto closeWorker = new VideoCaptureCloseWorker(self->state, callback);
  // Release our reference *after* closeWorker holds a reference, to prevent the
  // state from getting destructed on this thread (the main node thread)
  self->state = nullptr;
  Nan::AsyncQueueWorker(closeWorker);
}

#ifdef USE_LIBPREVIEW
void State::OnAbandonedCallback(void *userData) {
  State *state = static_cast<State*>(userData);
  uv_mutex_lock(&state->frameDataLock);
  if (state->frameBuffer != NULL) {
    state->client->releaseFrame(state->frameOwner);
    state->frameBuffer = NULL;
  }
  uv_mutex_unlock(&state->frameDataLock);
}

void State::OnFrameCallback(libpreview::Frame& frame) {
  State *state = static_cast<State *>(frame.userData);

  uv_mutex_lock(&state->frameDataLock);
  if (state->client) {
    if (state->frameBuffer != NULL) {
      state->client->releaseFrame(state->frameOwner);
    }
    state->frameBuffer = frame.frame;
    state->frameOwner = frame.owner;
    state->frameFormat = frame.format;
    state->frameWidth = frame.width;
    state->frameHeight = frame.height;
  }
  uv_mutex_unlock(&state->frameDataLock);
}
#endif

void Capture_Init(v8::Local<v8::Object> exports) {
  VideoCapture::Init(exports);
}
