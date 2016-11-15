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

static void unblockMainThread(int err) {
  write(pipefd[1], &err, sizeof(int));
}

Nan::Persistent<Function> Player::constructor;

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
    mLooper->registerHandler(mStreamPlayer);
  }
}

/**
 *
 */
Player::~Player() {
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

/**
 * Async worker handler for preparing and starting the stream player
 */
class PrepareAsyncWorker: public Nan::AsyncWorker {
public:
  PrepareAsyncWorker(Nan::Callback *callback, Player* player):
    Nan::AsyncWorker(callback),
    player(player) {
  }

  void Execute() {
    // Prepare and then start the player
    if (player->mStreamPlayer != NULL) {
      player->mStreamPlayer->start();
    } else {
      SetErrorMessage("Stream player not initialized?");
    }
  }

  void HandleOKCallback() {
    Local<Value> argv[] = {
      Nan::Null()
    };
    callback->Call(1, argv);
  }

private:
  Player *player;
};

NAN_METHOD(Player::Prepare) {
  SETUP_FUNCTION(Player)

  if (info.Length() != 1) {
    JSTHROW("Invalid number of arguments provided");
  }

  REQ_FUN_ARG(0, cb);

  // Call to stream player start is blocking so use asyn worker
  Nan::Callback *callback = new Nan::Callback(cb.As<Function>());
  Nan::AsyncQueueWorker(new PrepareAsyncWorker(callback, self));
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
  }
  info.GetReturnValue().Set(Nan::New<Boolean>(ret == NO_ERROR));
}

NAN_METHOD(Player::Resume) {
  SETUP_FUNCTION(Player)

  status_t ret = INVALID_OPERATION;
  if (self->mMediaPlayer != NULL) {
    ret = self->mMediaPlayer->start();
  }
  info.GetReturnValue().Set(Nan::New<Boolean>(ret == NO_ERROR));
}

NAN_METHOD(Player::GetCurrentPosition) {
  SETUP_FUNCTION(Player)

  int msec = -1;
  if (self->mMediaPlayer != NULL) {
    self->mMediaPlayer->getCurrentPosition(&msec);
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

NODE_MODULE(player, Player::Init);
