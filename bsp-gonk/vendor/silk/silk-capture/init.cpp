#include <nan.h>
#include <opencv2/opencv.hpp>

#if CV_MAJOR_VERSION < 3
#warning Building with OpenCV 2.x, please install OpenCV 3.x
#endif

void Capture_Init(v8::Local<v8::Object> exports);

void Init(v8::Local<v8::Object> exports) {
  Capture_Init(exports);
}

NODE_MODULE(bindings, Init)
