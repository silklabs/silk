#include <nan.h>
#include <android/log.h>

namespace {

using namespace v8;

Nan::NAN_METHOD_RETURN_TYPE
RealLog(Nan::NAN_METHOD_ARGS_TYPE info, android_LogPriority priority)
{
  const int argc = info.Length();
  if (!argc) {
    return;
  }
  if (argc > 2) {
    return Nan::ThrowTypeError("No more than two arguments allowed");
  }

  Nan::HandleScope scope;

  String::Utf8Value arg0(info[0]);
  if (!arg0.length()) {
    return Nan::ThrowTypeError("Argument 1 failed to convert to string");
  }

  if (argc > 1) {
    String::Utf8Value arg1(info[1]);

    if (!arg1.length()) {
      return Nan::ThrowTypeError("Argument 2 failed to convert to string");
    }

    __android_log_write(priority, *arg0, *arg1);
  } else {
    __android_log_write(priority, "node", *arg0);
  }

  return;
}

template <android_LogPriority priority>
inline NAN_METHOD(Log) {
  return RealLog(info, priority);
}

void init(Handle<Object> exports)
{
  Nan::SetMethod(exports, "verbose", Log<ANDROID_LOG_VERBOSE>);
  Nan::SetMethod(exports, "debug", Log<ANDROID_LOG_DEBUG>);
  Nan::SetMethod(exports, "info", Log<ANDROID_LOG_INFO>);
  Nan::SetMethod(exports, "warn", Log<ANDROID_LOG_WARN>);
  Nan::SetMethod(exports, "error", Log<ANDROID_LOG_ERROR>);
  Nan::SetMethod(exports, "fatal", Log<ANDROID_LOG_FATAL>);
}

} // anonymous namespace

NODE_MODULE(alog, init)
