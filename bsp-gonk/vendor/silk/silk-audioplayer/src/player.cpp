/**
 * Native implementation of silk-audioplayer API
 */

#define LOG_TAG "silk-audioplayer"
#ifdef ANDROID
// #define LOG_NDEBUG 0
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

Nan::Persistent<Function> Player::constructor;

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
  Nan::SetPrototypeMethod(ctor, "setDataSource", SetDataSource);
  Nan::SetPrototypeMethod(ctor, "start", Start);
  Nan::SetPrototypeMethod(ctor, "write", Write);
  Nan::SetPrototypeMethod(ctor, "setVolume", SetVolume);
  Nan::SetPrototypeMethod(ctor, "stop", Stop);
  Nan::SetPrototypeMethod(ctor, "pause", Pause);
  Nan::SetPrototypeMethod(ctor, "resume", Resume);
  Nan::SetPrototypeMethod(ctor, "getCurrentPosition", GetCurrentPosition);
  Nan::SetPrototypeMethod(ctor, "getDuration", GetDuration);
  Nan::SetPrototypeMethod(ctor, "endOfStream", EndOfStream);
  Nan::SetPrototypeMethod(ctor, "addEventListener", AddEventListener);

  // Constants
  #define CONST_INT(value) \
    Nan::ForceSet(exports, Nan::New(#value).ToLocalChecked(), Nan::New(value), \
      static_cast<PropertyAttribute>(ReadOnly|DontDelete));

  CONST_INT(DATA_SOURCE_TYPE_FILE);
  CONST_INT(DATA_SOURCE_TYPE_BUFFER);

  constructor.Reset(ctor->GetFunction());
  exports->Set(Nan::New("Player").ToLocalChecked(), ctor->GetFunction());
}

/**
 *
 */
Player::Player() {
  ALOGV("Creating instance of player");

  // This is required for Marshmallow onwards
  DataSource::RegisterDefaultSniffers();

  mLooper = new ALooper();
  mLooper->start();

  mStreamPlayer = new StreamPlayer();
  mStreamPlayer->setListener(this);
  mLooper->registerHandler(mStreamPlayer);

  uv_async_init(uv_default_loop(), &asyncHandle, Player::async_cb_handler);
  uv_unref(reinterpret_cast<uv_handle_t*>(&asyncHandle));
}

/**
 * Fetch the new event from the event queue and call the JS callback
 */
void Player::async_cb_handler(uv_async_t *handle) {
  Player* player = (Player*) handle->data;
  if (player == NULL) {
    ALOGE("Player handle null");
    return;
  }

  EventInfo* eventInfo;
  Mutex::Autolock autoLock(player->eventMutex);
  while (!player->eventQueue.empty()) {
    eventInfo = player->eventQueue.front();

    Isolate *isolate = Isolate::GetCurrent();
    v8::HandleScope handleScope(isolate);
    Local<Value> argv[] = {
      Nan::New<String>(eventInfo->event.c_str()).ToLocalChecked(),
      Nan::New<String>(eventInfo->errorMsg.c_str()).ToLocalChecked(),
    };
    Local<Function>::New(isolate, player->eventCallback)->
        Call(isolate->GetCurrentContext()->Global(), 2, argv);

    delete eventInfo;
    player->eventQueue.pop();
  }
}

/**
 * Add an event in the event queue and wake up the v8 default loop
 */
void Player::notify(int msg, const char* errorMsg) {
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
    eventInfo->errorMsg = errorMsg;
    break;
  default:
    ALOGV("Ignoring message msg=%d, errorMsg=%s", msg, errorMsg);
    return;
  }

  Mutex::Autolock autoLock(eventMutex);
  eventQueue.push(eventInfo);

  asyncHandle.data = this;
  uv_async_send(&asyncHandle);
}

/**
 *
 */
Player::~Player() {
  eventCallback.Reset();
  mStreamPlayer->reset();
  uv_close(reinterpret_cast<uv_handle_t*>(&asyncHandle), nullptr);
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

NAN_METHOD(Player::SetDataSource) {
  ALOGV("%s", __FUNCTION__);
  SETUP_FUNCTION(Player)

  if (info.Length() < 1) {
    JSTHROW("Invalid number of arguments provided");
  }

  uint32_t dataSourceType = DATA_SOURCE_TYPE_FILE;
  INT_FROM_ARGS(dataSourceType, 0)

  string fileName = "";
  if (dataSourceType == DATA_SOURCE_TYPE_FILE) {
    if (info.Length() < 2) {
      JSTHROW("Invalid number of arguments provided");
    }
    fileName = string(*Nan::Utf8String(info[1]->ToString()));
  }

  self->mStreamPlayer->setDataSource(dataSourceType, fileName.c_str());
}

NAN_METHOD(Player::Start) {
  SETUP_FUNCTION(Player)

  self->mStreamPlayer->start();
}

NAN_METHOD(Player::Write) {
  SETUP_FUNCTION(Player)

  if (info.Length() != 2) {
     JSTHROW("Invalid number of arguments provided");
  }

  char *buffer = UnwrapPointer(info[0]);
  int len = info[1]->Int32Value();
  ALOGV("Received %d bytes to be written", len);

  // Buffer audio data to be played by stream player
  int written = self->mStreamPlayer->write((const void*) buffer, len);
  info.GetReturnValue().Set(Nan::New<Number>(written));
}

NAN_METHOD(Player::SetVolume) {
  SETUP_FUNCTION(Player)

  if (info.Length() != 1) {
    JSTHROW("Invalid number of arguments provided");
  }

  self->mStreamPlayer->setVolume(info[0]->NumberValue());
}

NAN_METHOD(Player::Stop) {
  SETUP_FUNCTION(Player)

  self->mStreamPlayer->reset();
}

NAN_METHOD(Player::Pause) {
  SETUP_FUNCTION(Player)

  self->mStreamPlayer->pause();
}

NAN_METHOD(Player::Resume) {
  SETUP_FUNCTION(Player)

  self->mStreamPlayer->start();
}

NAN_METHOD(Player::GetCurrentPosition) {
  SETUP_FUNCTION(Player)

  int msec = -1;
  self->mStreamPlayer->getCurrentPosition(&msec);
  info.GetReturnValue().Set(Nan::New<Number>(msec));
}

NAN_METHOD(Player::GetDuration) {
  SETUP_FUNCTION(Player)

  int64_t msec = -1;
  self->mStreamPlayer->getDuration(&msec);
  info.GetReturnValue().Set(Nan::New<Number>(msec));
}

NAN_METHOD(Player::EndOfStream) {
  SETUP_FUNCTION(Player)

  self->mStreamPlayer->eos();
}

NAN_METHOD(Player::AddEventListener) {
  ALOGV("Adding event listener");
  SETUP_FUNCTION(Player)

  if (info.Length() != 1) {
    JSTHROW("Invalid number of arguments provided");
  }

  Isolate *isolate = info.GetIsolate();
  REQ_FUN_ARG(0, eventcb);
  self->eventCallback.Reset(isolate, eventcb);
}

NODE_MODULE(player, Player::Init);
