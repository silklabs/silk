/*
Copyright (c) 2015 Weave Laboratories, Inc.
All Rights Reserved.
Confidential and Proprietary - Weave Laboratories, Inc.
*/

#define LOG_NDEBUG 0
#define LOG_TAG "gonkmovie"
#include <utils/Log.h>

#include <binder/ProcessState.h>
#include <nan.h>

#include "BootAnimation.h"

using namespace v8;
using namespace android;


class MovieWorker : public NanAsyncWorker
{
public:
  MovieWorker(NanCallback *callback, sp<BootAnimation> aAnim)
    : NanAsyncWorker(callback), mAnim(aAnim) {}

  virtual ~MovieWorker() {}

  void Execute()
  {
    mAnim->run();
  }

private:
  sp<BootAnimation> mAnim;
};


class Movie : public node::ObjectWrap
{
public:
  static void Init(v8::Handle<v8::Object> exports) {
    NanScope();
    v8::Local<v8::FunctionTemplate> tpl = NanNew<v8::FunctionTemplate>(New);
    tpl->SetClassName(NanNew("Movie"));
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    NODE_SET_PROTOTYPE_METHOD(tpl, "hide", Hide);
    NODE_SET_PROTOTYPE_METHOD(tpl, "run", Run);
    NODE_SET_PROTOTYPE_METHOD(tpl, "stop", Stop);

    NanAssignPersistent(constructor, tpl->GetFunction());
    exports->Set(NanNew("Movie"), tpl->GetFunction());
  }

private:
  explicit Movie()
    : mAnim(NULL)
    , movieDoneCallback(NULL)
  {
    sp<ProcessState> ps = ProcessState::self();
    ps->startThreadPool();
  }

  ~Movie() {}

  static NAN_METHOD(New)
  {
    NanScope();

    if (args.IsConstructCall()) {
      Movie *obj = new Movie();
      obj->Wrap(args.This());
      NanReturnThis();
    } else {
      const int argc = 1;
      v8::Local<v8::Value> argv[argc] = {args[0]};
      v8::Local<v8::Function> cons = NanNew(constructor);
      NanReturnValue(cons->NewInstance(argc, argv));
    }
  }

  static NAN_METHOD(Run)
  {
    NanScope();
    Movie *me = ObjectWrap::Unwrap<Movie>(args.Holder());

    std::string movieFile(*v8::String::Utf8Value(args[0]->ToString()));
    NanCallback *callback = new NanCallback(args[1].As<Function>());

    if (me->mAnim == NULL) {
      me->mAnim = new BootAnimation();
    }

    if (!me->mAnim->load(movieFile.data())) {
      NanThrowError("Movie: Unable to load movie");
      return;
    }

    NanAsyncQueueWorker(new MovieWorker(callback, me->mAnim));
    NanReturnUndefined();
  }

  static NAN_METHOD(Stop)
  {
    NanScope();
    Movie *me = ObjectWrap::Unwrap<Movie>(args.Holder());
    if (me->mAnim != NULL) {
      me->mAnim->requestStop();
    }
    NanReturnUndefined();
  }

  static NAN_METHOD(Hide)
  {
    NanScope();
    Movie *me = ObjectWrap::Unwrap<Movie>(args.Holder());
    if (me->mAnim != NULL) {
      me->mAnim->requestStop();
    }
    me->mAnim = NULL;
    NanReturnUndefined();
  }

  sp<BootAnimation> mAnim;
  NanCallback *movieDoneCallback;

  static v8::Persistent<v8::Function> constructor;
};

v8::Persistent<v8::Function> Movie::constructor;


void init(Handle<Object> exports)
{
  Movie::Init(exports);
}
NODE_MODULE(movie, init)
