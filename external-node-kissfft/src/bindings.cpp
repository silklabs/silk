#ifdef ANDROID
#include <pthread.h>
#include "pthread_fixes.h"
#endif
#include <nan.h>

namespace fft {
#include "kiss_fft.c"
};
namespace fftr {
using namespace fft;
#include "kiss_fftr.c"
};

using namespace v8;

typedef fft::kiss_fft_cpx kiss_fft_cpx;

template <typename cfg_type, typename in_type, typename out_type>
class Worker : public Nan::AsyncWorker {
public:
  void HandleOKCallback();
  void Execute();

  Worker(Nan::Callback* callback, Local<Value> input, Local<Value> output);
  ~Worker();

private:
  cfg_type cfg;
  const in_type* in;
  out_type* out;
};


static void Alloc(fft::kiss_fft_cfg& cfg, size_t nfft) {
  cfg = fft::kiss_fft_alloc(nfft, false, 0, 0);
}

static void Alloc(fftr::kiss_fftr_cfg& cfg, size_t nfft) {
  cfg = fftr::kiss_fftr_alloc(nfft, false, 0, 0);
}

static void Free(fft::kiss_fft_cfg cfg) {
  fft::kiss_fft_free(cfg);
}

static void Free(fftr::kiss_fftr_cfg cfg) {
  fftr::kiss_fftr_free(cfg);
}

static void FFT(fft::kiss_fft_cfg cfg, const kiss_fft_cpx* in, kiss_fft_cpx* out) {
  kiss_fft(cfg, in, out);
}

static void FFT(fftr::kiss_fftr_cfg cfg, const kiss_fft_scalar* in, kiss_fft_cpx* out) {
  kiss_fftr(cfg, in, out);
}

template <typename cfg_type, typename in_type, typename out_type>
Worker<cfg_type, in_type, out_type>::Worker(Nan::Callback *callback, Local<Value> input, Local<Value> output)
  : Nan::AsyncWorker(callback) {
  Local<Float32Array> inArr = input.As<Float32Array>();
  Local<Float32Array> outArr = output.As<Float32Array>();
  size_t nfft = inArr->Length();
  if (nfft == outArr->Length())
    nfft /= 2;
  Alloc(cfg, nfft);
  SaveToPersistent("input", input);
  SaveToPersistent("output", output);
  in = (const in_type*) inArr->Buffer()->GetContents().Data();
  out = (out_type*) outArr->Buffer()->GetContents().Data();
}

template <typename cfg_type, typename in_type, typename out_type>
Worker<cfg_type, in_type, out_type>::~Worker() {
  Free(cfg);
}

template <typename cfg_type, typename in_type, typename out_type>
void Worker<cfg_type, in_type, out_type>::HandleOKCallback() {
  Nan::HandleScope scope;

  Local<Value> output = GetFromPersistent("output");
  Handle<Value> argv[2] = { Nan::Null(), output };
  callback->Call(2, argv);
}

template <typename cfg_type, typename in_type, typename out_type>
void Worker<cfg_type, in_type, out_type>::Execute() {
  FFT(cfg, in, out);
}

NAN_METHOD(_fft) {
  Nan::HandleScope scope;

  // Note: IsFloat32Array is an experimental feature...
  if (!info[0]->IsFloat32Array() || !info[1]->IsFloat32Array()) {
    Nan::ThrowTypeError("Float32Array expected");
    return;
  }

  Local<Float32Array> input = info[0].As<Float32Array>();
  Local<Float32Array> output = info[1].As<Float32Array>();
  Local<Function> callback = info[2].As<Function>();

  Nan::Callback* nanCallback = new Nan::Callback(callback);

  int input_len = input->Length();
  int output_len = output->Length();
  if (input_len != output_len && input_len + 2 != output_len) {
    Nan::ThrowTypeError("Mismatch of array length for input and output");
    return;
  }
  if (output_len & 1) {
    Nan::ThrowTypeError("Output array must have an even number of elements");
    return;
  }
  if (input_len == output_len) {
    Nan::AsyncQueueWorker(new Worker<fft::kiss_fft_cfg, kiss_fft_cpx, kiss_fft_cpx>(nanCallback, input, output));
  } else {
    Nan::AsyncQueueWorker(new Worker<fftr::kiss_fftr_cfg, kiss_fft_scalar, kiss_fft_cpx>(nanCallback, input, output));
  }
}

NAN_METHOD(_fftSync) {
  Nan::HandleScope scope;

  // Note: IsFloat32Array is an experimental feature...
  if (!info[0]->IsFloat32Array() || !info[1]->IsFloat32Array()) {
    Nan::ThrowTypeError("Float32Array expected");
    return;
  }

  Local<Float32Array> input = info[0].As<Float32Array>();
  Local<Float32Array> output = info[1].As<Float32Array>();

  int input_len = input->Length();
  int output_len = output->Length();
  if (input_len != output_len && input_len + 2 != output_len) {
    Nan::ThrowTypeError("Mismatch of array length for input and output");
    return;
  }
  if (output_len & 1) {
    Nan::ThrowTypeError("Output array must have an even number of elements");
    return;
  }

  kiss_fft_cpx* out = (kiss_fft_cpx*) output->Buffer()->GetContents().Data();
  if (input_len == output_len) {
    // Complex input, "normal" FFT.
    size_t nfft = input_len / 2;
    fft::kiss_fft_cfg cfg = fft::kiss_fft_alloc(nfft, false, 0, 0);
    const kiss_fft_cpx* in = (const kiss_fft_cpx*) input->Buffer()->GetContents().Data();

    FFT(cfg, in, out);

    fft::kiss_fft_free(cfg);
  } else {
    // Real-value input, optimized FFT.
    size_t nfft = input_len;
    fftr::kiss_fftr_cfg cfg = fftr::kiss_fftr_alloc(nfft, false, 0, 0);
    const kiss_fft_scalar* in = (const kiss_fft_scalar*) input->Buffer()->GetContents().Data();

    FFT(cfg, in, out);
    
    fftr::kiss_fftr_free(cfg);
  }
  info.GetReturnValue().Set(output);
}

static void Init(Handle<Object> exports) {
  exports->Set(Nan::New("fft").ToLocalChecked(), Nan::New<FunctionTemplate>(_fft)->GetFunction());
  exports->Set(Nan::New("fftSync").ToLocalChecked(), Nan::New<FunctionTemplate>(_fftSync)->GetFunction());
}

NODE_MODULE(kissfft, Init)
