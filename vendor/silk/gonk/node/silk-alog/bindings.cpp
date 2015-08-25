/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */
#include <nan.h>
#include <android/log.h>

namespace {

using namespace v8;

_NAN_METHOD_RETURN_TYPE
RealLog(_NAN_METHOD_ARGS, android_LogPriority priority)
{
  const int argc = args.Length();
  if (!argc) {
    NanReturnUndefined();
  }

  NanScope();

  String::Utf8Value arg0(args[0]);
  if (!arg0.length()) {
    return NanThrowTypeError("Argument 1 failed to convert to string");
  }

  if (argc > 1) {
    String::Utf8Value arg1(args[1]);

    if (!arg1.length()) {
      return NanThrowTypeError("Argument 2 failed to convert to string");
    }

    __android_log_print(priority, *arg0, *arg1);
  } else {
    __android_log_print(priority, "node", *arg0);
  }

  NanReturnUndefined();
}

template <android_LogPriority priority>
inline NAN_METHOD(Log) {
  return RealLog(args, priority);
}

void init(Handle<Object> exports)
{
  NODE_SET_METHOD(exports, "verbose", Log<ANDROID_LOG_VERBOSE>);
  NODE_SET_METHOD(exports, "debug", Log<ANDROID_LOG_DEBUG>);
  NODE_SET_METHOD(exports, "info", Log<ANDROID_LOG_INFO>);
  NODE_SET_METHOD(exports, "warn", Log<ANDROID_LOG_WARN>);
  NODE_SET_METHOD(exports, "error", Log<ANDROID_LOG_ERROR>);
  NODE_SET_METHOD(exports, "fatal", Log<ANDROID_LOG_FATAL>);
}

} // anonymous namespace

NODE_MODULE(alog, init)
