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
  Nan::SetPrototypeMethod(ctor, "setVolume", SetVolume);
  Nan::SetPrototypeMethod(ctor, "stop", Stop);
  Nan::SetPrototypeMethod(ctor, "pause", Pause);
  Nan::SetPrototypeMethod(ctor, "resume", Resume);

  constructor.Reset(ctor->GetFunction());
  exports->Set(Nan::New("Player").ToLocalChecked(), ctor->GetFunction());
}

/**
 *
 */
Player::Player():
    gain(GAIN_MAX) {
  ALOGV("Creating instance of player");

  sp<ProcessState> ps = ProcessState::self();
  ps->startThreadPool();

  mMediaPlayer = new MediaPlayer();
  mMediaPlayer->setListener(new MPListener);
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
    Player* obj = new Player();
    obj->Wrap(info.This());
    info.GetReturnValue().Set(info.This());
  } else {
    // Invoked as plain function `Player(...)`, turn into construct call.
    Local<Function> cons = Nan::New<Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance());
  }
}

/**
 * Async worker handler for playing audio file
 */
class PlayAsyncWorker: public Nan::AsyncWorker {
public:
  PlayAsyncWorker(Nan::Callback *callback, Player* player, string fileName):
    Nan::AsyncWorker(callback),
    player(player),
    fileName(fileName) {
  }

  void Execute() {
    int fd = open(fileName.c_str(), O_RDONLY);
    int64_t length = lseek64(fd, 0, SEEK_END);
    lseek64(fd, 0, SEEK_SET);

    OK(pipe(pipefd));

    ALOGV("Playing file %s", fileName.c_str());
    OK(player->mMediaPlayer->setDataSource(fd, 0, length));
    OK(player->mMediaPlayer->prepare());
    OK(player->mMediaPlayer->setVolume(player->gain, player->gain));
    OK(player->mMediaPlayer->start());

    int err;
    TEMP_FAILURE_RETRY(read(pipefd[0], &err, sizeof(int)));
    player->Done();
    if (err != 0) {
      ALOGE("Failed to play sound file %d", err);
      SetErrorMessage("Failed to play sound file");
      return;
    }
  }

private:
  Player *player;
  string fileName;
};

NAN_METHOD(Player::Play) {
  SETUP_FUNCTION(Player)

  if (info.Length() != 2) {
    JSTHROW("Invalid number of arguments provided");
  }

  string fileName = string(*Nan::Utf8String(info[0]->ToString()));
  REQ_FUN_ARG(1, cb);
  Nan::Callback *callback = new Nan::Callback(cb.As<Function>());

  Nan::AsyncQueueWorker(new PlayAsyncWorker(callback, self, fileName));
}

NAN_METHOD(Player::SetVolume) {
  SETUP_FUNCTION(Player)

  if (info.Length() != 1) {
    JSTHROW("Invalid number of arguments provided");
  }

  self->gain = info[0]->NumberValue();
  if (self->mMediaPlayer != NULL) {
    self->mMediaPlayer->setVolume(self->gain, self->gain);
  }
}

NAN_METHOD(Player::Stop) {
  SETUP_FUNCTION(Player)

  status_t ret = INVALID_OPERATION;
  if (self->mMediaPlayer != NULL) {
    ret = self->mMediaPlayer->stop();
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

NODE_MODULE(player, Player::Init);
