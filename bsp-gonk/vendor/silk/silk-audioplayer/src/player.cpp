/**
 * Native implementation of silk-audioplayer API
 */

#define LOG_TAG "silk-audioplayer"
#ifdef ANDROID
#define LOG_NDEBUG 0
#include <utils/Log.h>
#else
#define ALOGV(fmt, args...) fprintf(stderr, LOG_TAG ": " fmt, ##args); fprintf(stderr, "\n");
#define ALOGE ALOGV
#define ALOGD ALOGV
#endif

#include "player.h"

using Nan::AsyncProgressWorker;
using Nan::Callback;

#define OK(expression) { \
    status_t err = expression; \
    if (err != 0) { \
      ALOGE(#expression " failed: %d\n", err); \
      SetErrorMessage("Failed to play sound file"); \
      return; \
    } \
  }

static int pipefd[2];

// Message passing queue between StreamPlayer callback and v8 async handler
uv_async_t asyncHandle;
Mutex eventMutex;
std::queue<EventInfo *> eventQueue;
Persistent<Function> eventCallback;

static void unblockMainThread(int err) {
  write(pipefd[1], &err, sizeof(int));
}

Nan::Persistent<Function> Player::constructor;
extern uv_async_t async;

class MPListener : public MediaPlayerListener {
public:
  virtual void notify(int msg, int ext1, int ext2, const Parcel *obj) {
    switch (msg) {
    case MEDIA_PLAYBACK_COMPLETE:
    case MEDIA_STOPPED:
    case MEDIA_SKIPPED:
    case MEDIA_ERROR:
      ALOGD("Exiting playback on msg=%d, ext1=%d, ext2=%d", msg, ext1, ext2);
      unblockMainThread(ext1);
      break;
    default:
      ALOGV("Ignoring message msg=%d, ext1=%d, ext2=%d", msg, ext1, ext2);
      break;
    }
  }
};

/**
 *
 */
void Player::Init(Local<Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  Local<FunctionTemplate> ctor = Nan::New<FunctionTemplate>(New);
  ctor->SetClassName(Nan::New("Player").ToLocalChecked());
  ctor->InstanceTemplate()->SetInternalFieldCount(1);

  // Prototype
  Nan::SetPrototypeMethod(ctor, "play", Play);
  Nan::SetPrototypeMethod(ctor, "prepare", Prepare);
  Nan::SetPrototypeMethod(ctor, "write", Write);
  Nan::SetPrototypeMethod(ctor, "setVolume", SetVolume);
  Nan::SetPrototypeMethod(ctor, "stop", Stop);
  Nan::SetPrototypeMethod(ctor, "pause", Pause);
  Nan::SetPrototypeMethod(ctor, "resume", Resume);
  Nan::SetPrototypeMethod(ctor, "getCurrentPosition", GetCurrentPosition);
  Nan::SetPrototypeMethod(ctor, "getDuration", GetDuration);
  Nan::SetPrototypeMethod(ctor, "endOfStream", EndOfStream);
  Nan::SetPrototypeMethod(ctor, "addEventListener", AddEventListener);

  constructor.Reset(ctor->GetFunction());
  exports->Set(Nan::New("Player").ToLocalChecked(), ctor->GetFunction());
}

/**
 *
 */
Player::Player(AudioType audioType):
    gain(GAIN_MAX) {
  ALOGV("Creating instance of player");

  if (audioType == AUDIO_TYPE_FILE) {
    sp<ProcessState> ps = ProcessState::self();
    ps->startThreadPool();

    mMediaPlayer = new MediaPlayer();
    mMediaPlayer->setListener(new MPListener);
  } else {
    mLooper = new ALooper();
    mLooper->start();

    mStreamPlayer = new StreamPlayer();
    mStreamPlayer->setListener(this);
    mLooper->registerHandler(mStreamPlayer);
  }
}

/**
 * Fetch the new event from the event queue and call the JS callback
 */
void Player::async_cb_handler(uv_async_t *handle) {
  EventInfo* eventInfo;
  Mutex::Autolock autoLock(eventMutex);
  while (!eventQueue.empty()) {
    eventInfo = eventQueue.front();

    Isolate *isolate = Isolate::GetCurrent();
    v8::HandleScope handleScope(isolate);
    Local<Value> argv[] = {
      Nan::New<String>(eventInfo->event.c_str()).ToLocalChecked(),
      Nan::New<String>(eventInfo->errorMsg.c_str()).ToLocalChecked(),
    };
    Local<Function>::New(isolate, eventCallback)->
        Call(isolate->GetCurrentContext()->Global(), 2, argv);

    delete eventInfo;
    eventQueue.pop();
  }
}

/**
 * Add an event in the event queue and wake up the v8 default loop
 */
void Player::notify(int msg, int ext1, int ext2, const Parcel *obj) {
  EventInfo *eventInfo = new EventInfo();
  eventInfo->errorMsg = "";

  switch (msg) {
  case MEDIA_PREPARED:
    eventInfo->event = "prepared";
    break;
  case MEDIA_STARTED:
    eventInfo->event = "started";
    break;
  case MEDIA_PAUSED:
    eventInfo->event = "paused";
    break;
  case MEDIA_PLAYBACK_COMPLETE:
    eventInfo->event = "done";
    break;
  case MEDIA_ERROR:
    eventInfo->event = "error";
    eventInfo->errorMsg = "unknown media error";
    break;
  default:
    ALOGV("Ignoring message msg=%d, ext1=%d, ext2=%d", msg, ext1, ext2);
    return;
  }

  Mutex::Autolock autoLock(eventMutex);
  eventQueue.push(eventInfo);
  uv_async_send(&asyncHandle);
}

/**
 *
 */
Player::~Player() {
  eventCallback.Reset();
}

void Player::Done() {
  gain = GAIN_MAX;
  mMediaPlayer->reset();
}

/**
 *
 */
NAN_METHOD(Player::New) {
  if (info.IsConstructCall()) {
    // Invoked as constructor: `new Player(...)`
    uint32_t audioType = AUDIO_TYPE_FILE;
    INT_FROM_ARGS(audioType, 0)

    Player* obj = new Player((AudioType) audioType);
    obj->Wrap(info.This());
    info.GetReturnValue().Set(info.This());
  } else {
    // Invoked as plain function `Player(...)`, turn into construct call.
    const int argc = 1;
    v8::Local<v8::Value> argv[argc] = { info[0] };

    Local<Function> cons = Nan::New<Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance(argc, argv));
  }
}

/**
 * Async worker handler for playing audio file
 */
class PlayAsyncWorker: public AsyncProgressWorker {
public:
  PlayAsyncWorker(Player* player, string fileName, Callback *doneCallback,
                  Callback *startCallback):
    AsyncProgressWorker(doneCallback),
    player(player),
    fileName(fileName),
    startCallback(startCallback) {
  }

  void Execute(const AsyncProgressWorker::ExecutionProgress& progress) {
    int fd = open(fileName.c_str(), O_RDONLY);
    int64_t length = lseek64(fd, 0, SEEK_END);
    lseek64(fd, 0, SEEK_SET);

    OK(pipe(pipefd));

    ALOGV("Playing file %s", fileName.c_str());
    OK(player->mMediaPlayer->setDataSource(fd, 0, length));
    OK(player->mMediaPlayer->prepare());
    OK(player->mMediaPlayer->setVolume(player->gain, player->gain));
    OK(player->mMediaPlayer->start());

    progress.Signal();

    int err;
    TEMP_FAILURE_RETRY(read(pipefd[0], &err, sizeof(int)));
    player->Done();
    if (err != 0) {
      ALOGE("Failed to play sound file %d", err);
      SetErrorMessage("Failed to play sound file");
      return;
    }
  }

  void HandleProgressCallback(const char *data, size_t size) {
    Nan::HandleScope scope;

    Local<Value> argv[1] = {Nan::Null()};
    startCallback->Call(1, argv);
  }

private:
  Player *player;
  string fileName;
  Callback *startCallback;
};

NAN_METHOD(Player::Play) {
  SETUP_FUNCTION(Player)

  if (info.Length() != 3) {
    JSTHROW("Invalid number of arguments provided");
  }

  string fileName = string(*Nan::Utf8String(info[0]->ToString()));
  REQ_FUN_ARG(1, donecb);
  Callback *doneCallback = new Callback(donecb.As<Function>());

  REQ_FUN_ARG(2, startcb);
  Callback *startCallback = new Callback(startcb.As<Function>());

  Nan::AsyncQueueWorker(new PlayAsyncWorker(self, fileName, doneCallback,
                                            startCallback));
}

NAN_METHOD(Player::Prepare) {
  SETUP_FUNCTION(Player)

  if (self->mStreamPlayer != NULL) {
    self->mStreamPlayer->start();
  }
}

NAN_METHOD(Player::Write) {
  SETUP_FUNCTION(Player)

  if (info.Length() != 2) {
     JSTHROW("Invalid number of arguments provided");
  }

  char *buffer = UnwrapPointer(info[0]);
  int len = info[1]->Int32Value();
  // ALOGV("Received %d bytes to be written", len);

  // Buffer audio data to be played by stream player
  int written = 0;
  if (self->mStreamPlayer != NULL) {
    written = self->mStreamPlayer->write((const void*) buffer, len);
  }
  info.GetReturnValue().Set(Nan::New<Number>(written));
}

NAN_METHOD(Player::SetVolume) {
  SETUP_FUNCTION(Player)

  if (info.Length() != 1) {
    JSTHROW("Invalid number of arguments provided");
  }

  self->gain = info[0]->NumberValue();
  if (self->mMediaPlayer != NULL) {
    self->mMediaPlayer->setVolume(self->gain, self->gain);
  } else if (self->mStreamPlayer != NULL) {
    self->mStreamPlayer->setVolume(self->gain);
  }
}

NAN_METHOD(Player::Stop) {
  SETUP_FUNCTION(Player)

  status_t ret = INVALID_OPERATION;
  if (self->mMediaPlayer != NULL) {
    ret = self->mMediaPlayer->stop();
  } else if (self->mStreamPlayer != NULL) {
    ret = self->mStreamPlayer->stop();
  }
  info.GetReturnValue().Set(Nan::New<Boolean>(ret == NO_ERROR));
}

NAN_METHOD(Player::Pause) {
  SETUP_FUNCTION(Player)

  status_t ret = INVALID_OPERATION;
  if (self->mMediaPlayer != NULL) {
    ret = self->mMediaPlayer->pause();
  } else if (self->mStreamPlayer != NULL) {
    ret = self->mStreamPlayer->stop(true /* paused */);
  }

  info.GetReturnValue().Set(Nan::New<Boolean>(ret == NO_ERROR));
}

NAN_METHOD(Player::Resume) {
  SETUP_FUNCTION(Player)

  status_t ret = INVALID_OPERATION;
  if (self->mMediaPlayer != NULL) {
    ret = self->mMediaPlayer->start();
  } else if (self->mStreamPlayer != NULL) {
    ret = self->mStreamPlayer->start();
  }
  info.GetReturnValue().Set(Nan::New<Boolean>(ret == NO_ERROR));
}

NAN_METHOD(Player::GetCurrentPosition) {
  SETUP_FUNCTION(Player)

  int msec = -1;
  if (self->mMediaPlayer != NULL) {
    self->mMediaPlayer->getCurrentPosition(&msec);
  } else if (self->mStreamPlayer != NULL) {
    self->mStreamPlayer->getCurrentPosition(&msec);
  }
  info.GetReturnValue().Set(Nan::New<Number>(msec));
}

NAN_METHOD(Player::GetDuration) {
  SETUP_FUNCTION(Player)

  int msec = -1;
  if (self->mMediaPlayer != NULL) {
    self->mMediaPlayer->getDuration(&msec);
  }
  info.GetReturnValue().Set(Nan::New<Number>(msec));
}

NAN_METHOD(Player::EndOfStream) {
  SETUP_FUNCTION(Player)

  if (self->mStreamPlayer != NULL) {
    self->mStreamPlayer->eos();
  }
}

NAN_METHOD(Player::AddEventListener) {
  ALOGD("Adding event listener");
  SETUP_FUNCTION(Player)

  if (info.Length() != 1) {
    JSTHROW("Invalid number of arguments provided");
  }

  Isolate *isolate = info.GetIsolate();
  REQ_FUN_ARG(0, eventcb);
  eventCallback.Reset(isolate, eventcb);

  uv_async_init(uv_default_loop(), &asyncHandle, Player::async_cb_handler);
}

NODE_MODULE(player, Player::Init);
