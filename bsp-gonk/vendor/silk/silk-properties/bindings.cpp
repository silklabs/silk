#include <nan.h>
#ifdef ANDROID
#include <cutils/properties.h>
#else
#define PROPERTY_VALUE_MAX 92
#endif

NAN_METHOD(GetProperty) {
  Nan::HandleScope scope;

  if (info.Length() != 1 || !info[0]->IsString()) {
    return Nan::ThrowError("Expected only one string argument: GetProperty");
  }

  char *property_name = *Nan::Utf8String(info[0]);
  char property_value[PROPERTY_VALUE_MAX];
  const char* default_value = "";
  int len;
#ifdef ANDROID
  len = property_get(property_name, property_value, default_value);
#else
  char file[PROPERTY_VALUE_MAX * 2];
  snprintf(file, sizeof(file), "data/properties/%s", property_name);
  FILE *fp = fopen(file, "r");
  if (fp != NULL) {
    fgets(property_value, sizeof(property_value) - 1, fp);
    fclose(fp);
  } else {
    // Return default value
    strncpy(property_value, default_value, sizeof(property_value) - 1);
  }
  property_value[sizeof(property_value)-1] = '\0';
  len = strlen(property_value);

  // Remove trailing newline
  while (len > 0) {
    char c = property_value[len - 1];
    if (c == '\n' || c == '\r') {
      property_value[len - 1] = '\0';
      len--;
    } else {
      break;
    }
  }
#endif

  info.GetReturnValue().Set(
      Nan::New<v8::String>(property_value, len).ToLocalChecked()
  );
}

NAN_METHOD(SetProperty) {
  Nan::HandleScope scope;

  if (info.Length() != 2 || !info[0]->IsString() || !info[1]->IsString()) {
    return Nan::ThrowError("SetProperty expects two string arguments");
  }

  v8::String::Utf8Value property_name(info[0]);
  v8::String::Utf8Value property_value(info[1]);
#ifdef ANDROID
  int result = property_set(*property_name, *property_value);
  info.GetReturnValue().Set(Nan::New<v8::Number>(result));
#else
  int result = -1;
  char file[PROPERTY_VALUE_MAX * 2];
  snprintf(file, sizeof(file), "data/properties/%s", *property_name);
  FILE *fp = fopen(file, "w");
  if (fp != NULL) {
    fputs(*property_value, fp);
    fputs("\n", fp);
    fclose(fp);
    result = 0;
  }
  info.GetReturnValue().Set(Nan::New<v8::Number>(result));
#endif
}

void init(v8::Handle<v8::Object> exports)
{
  exports->Set(Nan::New<v8::String>("get").ToLocalChecked(),
    Nan::New<v8::FunctionTemplate>(GetProperty)->GetFunction());
  exports->Set(Nan::New<v8::String>("set").ToLocalChecked(),
    Nan::New<v8::FunctionTemplate>(SetProperty)->GetFunction());
}

NODE_MODULE(properties, init)
