#include <nan.h>

#ifdef ANDROID
//#define LOG_NDEBUG 0
#define LOG_TAG "silk-movie"
#include <utils/Log.h>

#include <binder/ProcessState.h>
#include "BootAnimation.h"

#else

namespace android {
class BootAnimation
{
public:
  bool load(char const *zipFile) { return true; };
  void run() {};
  void requestStop(bool block = false) {};
};

template <class T>
class sp {
  T *p;
public:
  sp(T* p) : p(p) {};
  T* operator -> () const { return p; }
  bool operator == (const T* o) const { return p == o; }
  bool operator != (const T* o) const { return p != o; }
};
} // namespace android

#endif

using namespace android;
using namespace v8;


class MovieWorker : public Nan::AsyncWorker
{
public:
  MovieWorker(Nan::Callback *callback, sp<BootAnimation> aAnim)
    : Nan::AsyncWorker(callback), mAnim(aAnim) {}

  virtual ~MovieWorker() {}

  void Execute()
  {
    mAnim->run();
  }

private:
  sp<BootAnimation> mAnim;
};


class Movie : public Nan::ObjectWrap
{
public:
  static void Init(v8::Handle<v8::Object> exports) {
    Nan::HandleScope scope;
    v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
    tpl->SetClassName(Nan::New("Movie").ToLocalChecked());
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    Nan::SetPrototypeMethod(tpl, "hide", Hide);
    Nan::SetPrototypeMethod(tpl, "run", Run);
    Nan::SetPrototypeMethod(tpl, "stop", Stop);

    constructor.Reset(tpl->GetFunction());
    exports->Set(Nan::New("Movie").ToLocalChecked(), tpl->GetFunction());
  }

private:
  explicit Movie()
    : mAnim(NULL)
  {
#ifdef ANDROID
    sp<ProcessState> ps = ProcessState::self();
    ps->startThreadPool();
#endif
  }

  ~Movie() {}

  static NAN_METHOD(New)
  {
    Nan::HandleScope scope;

    if (info.IsConstructCall()) {
      Movie *obj = new Movie();
      obj->Wrap(info.This());
      info.GetReturnValue().Set(info.This());
    } else {
      const int argc = 1;
      v8::Local<v8::Value> argv[argc] = {info[0]};
      v8::Local<v8::Function> cons = Nan::New(constructor);
      info.GetReturnValue().Set(cons->NewInstance(argc, argv));
    }
  }

  static NAN_METHOD(Run)
  {
    Nan::HandleScope scope;
    Movie *me = Nan::ObjectWrap::Unwrap<Movie>(info.Holder());

    const int argc = info.Length();
    if (argc != 2) {
      Nan::ThrowError("Movie: two arguments expected");
      return;
    }

    std::string movieFile(*v8::String::Utf8Value(info[0]->ToString()));
    Nan::Callback *callback = new Nan::Callback(info[1].As<Function>());

    if (me->mAnim == NULL) {
      me->mAnim = new BootAnimation();
    }

    if (!me->mAnim->load(movieFile.data())) {
      Nan::ThrowError("Movie: Unable to load movie");
      return;
    }

    Nan::AsyncQueueWorker(new MovieWorker(callback, me->mAnim));
    return;
  }

  static NAN_METHOD(Stop)
  {
    Nan::HandleScope scope;
    Movie *me = Nan::ObjectWrap::Unwrap<Movie>(info.Holder());
    if (me->mAnim != NULL) {
      me->mAnim->requestStop();
    }
    return;
  }

  static NAN_METHOD(Hide)
  {
    Nan::HandleScope scope;
    Movie *me = Nan::ObjectWrap::Unwrap<Movie>(info.Holder());
    if (me->mAnim != NULL) {
      me->mAnim->requestStop();
    }
    me->mAnim = NULL;
    return;
  }

  sp<BootAnimation> mAnim;

  static Nan::Persistent<v8::Function> constructor;
};

Nan::Persistent<v8::Function> Movie::constructor;


void init(Handle<Object> exports)
{
  Movie::Init(exports);
}
NODE_MODULE(movie, init)
