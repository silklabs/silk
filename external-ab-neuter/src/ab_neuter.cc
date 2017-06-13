#include <v8.h>
#include <node.h>
#include <stdlib.h>
#include <string.h>

namespace ab_n {

using v8::ArrayBuffer;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::NewStringType;
using v8::Object;
using v8::String;
using v8::Value;

void ThrowError(Isolate* isolate, const char* err_msg) {
  Local<String> str = String::NewFromOneByte(
      isolate,
      reinterpret_cast<const uint8_t*>(err_msg),
      NewStringType::kNormal).ToLocalChecked();
  isolate->ThrowException(str);
}

void Neuter(const FunctionCallbackInfo<Value>& args) {
  if (!args[0]->IsArrayBuffer()) {
    return ThrowError(args.GetIsolate(),
                      "argument is not an ArrayBuffer or Typed Array");
  }

  Local<ArrayBuffer> ab = args[0].As<ArrayBuffer>();
  if (ab->IsExternal()) {
    return ThrowError(args.GetIsolate(),
                      "ArrayBuffer can't be externalized");
  }

  ArrayBuffer::Contents contents = ab->Externalize();
  ab->Neuter();
  free(contents.Data());
}

void Init(Local<Object> exports) {
  NODE_SET_METHOD(exports, "neuter", Neuter);
}

}  // namespace ab_n

NODE_MODULE(ab_neuter, ab_n::Init)
