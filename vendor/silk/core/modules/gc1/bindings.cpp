#include <nan.h>

NAN_METHOD(IdleNotification) {
  NanScope();

  if (args.Length() != 1) {
    return NanThrowError("Expected only one argument: idle_time_in_ms");
  }
  int idle_time_in_ms = args[0]->Uint32Value();
  NanReturnValue(NanIdleNotification(idle_time_in_ms));
}

void init(v8::Handle<v8::Object> exports)
{
  exports->Set(NanNew<v8::String>("idleNotification"),
    NanNew<v8::FunctionTemplate>(IdleNotification)->GetFunction());
}

NODE_MODULE(gc1, init)
