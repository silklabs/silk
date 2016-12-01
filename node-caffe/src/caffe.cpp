/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#include <node.h>
#include <nan.h>

#ifdef __clang__
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wsign-compare"
#pragma clang diagnostic ignored "-Wunused-local-typedef"
#endif

#include <caffe/common.hpp>
#include <caffe/blob.hpp>
#include <caffe/layer.hpp>
#include <caffe/layers/base_data_layer.hpp>
#include <caffe/net.hpp>
#include <caffe/solver.hpp>
#include <caffe/solver_factory.hpp>
#include <caffe/util/upgrade_proto.hpp>
#include <caffe/util/io.hpp>
#include <caffe/parallel.hpp>

#ifdef __clang
#pragma clang diagnostic pop
#endif

#include <string.h>
#include <sstream>
#include <vector>
#include <list>

#include <google/protobuf/text_format.h>

using std::ostream;
using std::string;
using std::stringstream;
using std::vector;
using std::list;

using boost::shared_ptr;

using v8::Array;
using v8::ArrayBuffer;
using v8::Float32Array;
using v8::Float64Array;
using v8::Function;
using v8::FunctionTemplate;
using v8::Handle;
using v8::Local;
using v8::Number;
using v8::Object;
using v8::ObjectTemplate;
using v8::Primitive;
using v8::String;
using v8::Uint32;
using v8::Value;

using Nan::AdjustExternalMemory;
using Nan::AsyncWorker;
using Nan::Callback;
using Nan::EscapableHandleScope;
using Nan::FunctionCallbackInfo;
using Nan::Get;
using Nan::HandleScope;
using Nan::MaybeLocal;
using Nan::NewBuffer;
using Nan::ObjectWrap;
using Nan::Persistent;
using Nan::Set;
using Nan::ThrowError;
using Nan::ThrowTypeError;
using Nan::ToArrayIndex;
using Nan::Undefined;

using google::protobuf::TextFormat;

using caffe::Caffe;

static int gpu_device_ = 0;
static Caffe::Brew gpu_mode_ = Caffe::CPU;

// Get an argument or undefined
static Local<Value> Arg(const FunctionCallbackInfo<Value>& info, int n) {
  if (n < info.Length())
    return info[n];
  return Undefined();
}

// Return undefined
struct Void {};
static Local<Primitive> ToValue(Void v) {
  return Nan::Undefined();
}

// Cast a number to JavaScript
static Local<Number> ToValue(double f) {
  return Nan::New(f);
}

// Cast a string to JavaScript
static Local<String> ToValue(const string& str) {
  return Nan::New(str.c_str()).ToLocalChecked();
}

// Cast various internal datatypes to JavaScript. These are forward declared
// here so ToArray() can use them and each of these functions retains a
// reference via shared_ptr.
template <typename Dtype>
static Local<Value> ToValue(shared_ptr<caffe::Blob<Dtype> >);

template <typename Dtype>
static Local<Value> ToValue(caffe::Blob<Dtype>* blob);

template <typename Dtype>
static Local<Value> ToValue(shared_ptr<caffe::Layer<Dtype> >);

template <typename Dtype>
static Local<Value> ToValue(shared_ptr<caffe::Net<Dtype> >);

// Get the length of an array (or array-like object)
static size_t ArrayLength(Local<Value> v, Local<Object>* obj) {
  if (v->IsObject()) {
    *obj = v->ToObject();
    if (v->IsArray())
      return Local<Array>::Cast(v)->Length();
    MaybeLocal<Value> prop = Get(*obj, ToValue("Length"));
    if (!prop.IsEmpty()) {
      MaybeLocal<Uint32> length = ToArrayIndex(prop.ToLocalChecked());
      if (!length.IsEmpty() && length.ToLocalChecked()->IsUint32())
        return length.ToLocalChecked()->Uint32Value();
    }
  }
  return 0;
}

// Convert a vector of things that we have a ToValue implementation for
// to a JavaScript array.
template <typename T>
static Local<Array> ToArray(const T *data, size_t n) {
  Local<Array> result = Nan::New<Array>(n);
  for (size_t i = 0; i < n; ++i)
    result->Set(i, ToValue(data[i]));
  return result;
}

template <typename T>
static Local<Array> ToArray(const vector<T>& vec) {
  return ToArray(&vec[0], vec.size());
}

// Convert the void type.
static void FromValue(Local<Value> val, Void& v) {
}

// Convert JavaScript numbers to integers and floats.
static void FromValue(Local<Value> val, int& i) {
  i = val->IntegerValue();
}

template <typename T>
static void FromValue(Local<Value> val, T& f) {
  f = val->NumberValue();
}

template <typename Dtype>
static void FromValue(Local<Value> val, shared_ptr<caffe::Blob<Dtype> >& b);

// Convert a JavaScript array of values to a vector of values we have
// a FromValue implementation for.
template <typename T>
static const vector<T> FromArray(Local<Value> v) {
  vector<T> vec;
  Local<Object> obj;
  size_t len = ArrayLength(v, &obj);
  if (len) {
    for (size_t i = 0; i < len; ++i) {
      T val;
      FromValue((*obj)->Get(i), val);
      vec.push_back(val);
    }
  }
  return vec;
}

// Return "Float" or "Double" depending on T.
template <typename T>
static string TypeName() {
  return string((sizeof(T) == sizeof(double)) ? "Double" : "Float");
}

// Print a vector of printable types T to a stream.
template <typename T>
ostream& operator<<(ostream& stream, const vector<T>& vec) {
  if (!vec.size())
    return stream;
  stream << vec[0];
  for (size_t i = 1; i < vec.size(); ++i) {
    stream << "," << vec[i];
  }
  return stream;
}

static int num_gpus() {
  int count = 0;
#ifndef CPU_ONLY
  CUDA_CHECK(cudaGetDeviceCount(&count));
#endif
  return count;
}

static void get_gpus(vector<int>* gpus) {
  int count = 0;
#ifndef CPU_ONLY
  count = Caffe::solver_count();
#endif

  for (int i = 0; i < count; ++i) {
    gpus->push_back(i);
  }
}

// A new layer type "BufferedDataLayer" that will pull data blobs
// from a queue every time Forward() is called. Script can refill
// the layer with more blobs.
namespace caffe {

template <typename Dtype>
class BufferedDataLayer : public BaseDataLayer<Dtype> {
public:
  explicit BufferedDataLayer(const LayerParameter& param)
    : caffe::BaseDataLayer<Dtype>(param) {}

  virtual void DataLayerSetUp(const vector<Blob<Dtype>*>& bottom,
                              const vector<Blob<Dtype>*>& top) {
    const InputParameter& param = this->layer_param_.input_param();
    const size_t num_shape = param.shape_size();
    for (size_t i = 0; i < top.size(); ++i)
      top[i]->Reshape(param.shape((i < num_shape) ? i : 0));
  }

  virtual inline const char* type() const { return "BufferedDataLayer"; }
  virtual inline int ExactNumBottomBlobs() const { return 0; }
  virtual inline int ExactNumTopBlobs() const { return this->layer_param_.input_param().shape_size(); }

  void Enqueue(const vector<shared_ptr<caffe::Blob<Dtype> > > blob) {
    queue.push_back(blob);
  }

  size_t QueueLength() const {
    return queue.size();
  }

protected:
  virtual void Forward_cpu(const vector<Blob<Dtype>*>& bottom,
                           const vector<Blob<Dtype>*>& top) {
    if (!queue.size()) {
      LOG(FATAL) << "BufferedDataLayer empty in Forward.";
      return;
    }

    vector<shared_ptr<caffe::Blob<Dtype> > >& blobs = queue.front();
    for (size_t i = 0; i < top.size(); ++i) {
      if (i >= blobs.size())
        continue;
      top[i]->CopyFrom(*blobs[i], false, false);
    }
    queue.pop_front();
  }

  list<vector<shared_ptr<caffe::Blob<Dtype> > > > queue;
};

INSTANTIATE_CLASS(BufferedDataLayer);
REGISTER_LAYER_CLASS(BufferedData);

}

struct SyncedMemoryHolder {
  shared_ptr<caffe::SyncedMemory> mem;
};

// Wrap a SyncedMemory object into an array buffer and retain a shared_ptr
// reference of it until the GC releases the array buffer.
static void Deref_SyncedMemory(char *data, void *hint) {
  delete reinterpret_cast<SyncedMemoryHolder *>(hint);
}

static Local<Object> ToBuffer(shared_ptr<caffe::SyncedMemory> mem, size_t size) {
  SyncedMemoryHolder *holder = new SyncedMemoryHolder();
  holder->mem = mem;
  return NewBuffer((char *) mem->mutable_cpu_data(),
                   size,
                   Deref_SyncedMemory,
                   holder).ToLocalChecked();
}

// Construct a new Float32Array or Float64Array around a node Buffer
template <typename T>
static Local<T> NewTypedArray(const Local<Object>& node_buffer, size_t byte_offset, size_t length) {
  Local<Value> buffer = Get(node_buffer, ToValue("buffer")).ToLocalChecked();
  return T::New(Local<ArrayBuffer>::Cast(buffer), byte_offset, length);
}

static Local<Value> NewTypedArray(float elem_type, const Local<Object>& node_buffer, size_t byte_offset, size_t length) {
  return NewTypedArray<Float32Array>(node_buffer, byte_offset, length);
}

static Local<Value> NewTypedArray(double elem_type, const Local<Object>& node_buffer, size_t byte_offset, size_t length) {
  return NewTypedArray<Float64Array>(node_buffer, byte_offset, length);
}

// Construct a typed class name (NetFloat, etc.)
#define CLASS_NAME(name, Dtype) Nan::New(string(name) + TypeName<Dtype>()).ToLocalChecked()

// Node wrapper class for Blobs.
template <typename Dtype>
class Blob : public ObjectWrap {
public:
  explicit Blob(shared_ptr<caffe::Blob<Dtype> > existing) : blob_(existing) {
  }

  explicit Blob(const vector<int>& shape) : blob_(new caffe::Blob<Dtype>(shape)) {
    AdjustExternalMemory(blob_->count() * 2 * sizeof(Dtype));
  }

  virtual ~Blob() {
    AdjustExternalMemory(-blob_->count() * 2 * sizeof(Dtype));
  }

  static Local<String> class_name() {
    return CLASS_NAME("Blob", Dtype);
  }

  static NAN_MODULE_INIT(Init) {
    Local<FunctionTemplate> ctor = Nan::New<FunctionTemplate>(New);
    ctor_.Reset(ctor);

    ctor->SetClassName(class_name());
    ctor->InstanceTemplate()->SetInternalFieldCount(1);
    Local<ObjectTemplate> proto = ctor->PrototypeTemplate();

    SetPrototypeMethod(ctor, "toString", ToString);

    SetAccessor(proto, ToValue("shape"), GetShape, SetShape);
    SetAccessor(proto, ToValue("data"), GetData);
    SetAccessor(proto, ToValue("diff"), GetDiff);
    SetAccessor(proto, ToValue("dataBuffer"), GetDataBuffer);
    SetAccessor(proto, ToValue("diffBuffer"), GetDiffBuffer);

    ctor_instance_.Reset(ctor->GetFunction());
    Set(target, class_name(), ctor->GetFunction());
  }

  static Local<Value> Create(shared_ptr<caffe::Blob<Dtype> > blob) {
    EscapableHandleScope scope;
    MaybeLocal<Object> instance = Nan::NewInstance(Nan::New(ctor_instance_));
    Blob* obj = new Blob(blob);
    obj->Wrap(instance.ToLocalChecked());
    return scope.Escape(instance.ToLocalChecked());
  }

  static Local<Value> Create(caffe::Blob<Dtype>* blob) {
    EscapableHandleScope scope;
    MaybeLocal<Object> instance = Nan::NewInstance(Nan::New(ctor_instance_));
    Blob* obj = new Blob(blob->shape());
    caffe::caffe_copy(obj->blob_->count(), blob->cpu_data(),
                      obj->blob_->mutable_cpu_data());
    obj->Wrap(instance.ToLocalChecked());
    return scope.Escape(instance.ToLocalChecked());
  }

  static shared_ptr<caffe::Blob<Dtype> > Cast(Local<Object> obj) {
    if (!Nan::New(ctor_)->HasInstance(obj))
      return nullptr;
    return Unwrap<Blob>(obj)->blob_;
  }

private:
  static NAN_METHOD(New) {
    if (info.IsConstructCall()) {
      vector<int> shape;
      Blob *obj = new Blob(FromArray<int>(Arg(info, 0)));
      obj->Wrap(info.This());
      info.GetReturnValue().Set(info.This());
    } else {
      const int argc = 1;
      Local<Value> argv[argc] = { Arg(info, 0) };
      MaybeLocal<Function> fun = Nan::New(ctor_instance_);
      info.GetReturnValue().Set(Nan::NewInstance(fun.ToLocalChecked(), argc, argv).ToLocalChecked());
    }
  }

  #define UNWRAP \
    if (!Nan::New(ctor_)->HasInstance(info.This())) \
      return; \
    shared_ptr<caffe::Blob<Dtype> > blob_(Unwrap<Blob>(info.This())->blob_)

  static NAN_METHOD(ToString) {
    UNWRAP;
    stringstream ss;
    ss << "Blob" << TypeName<Dtype>() << " (" << blob_->shape() << ")";
    info.GetReturnValue().Set(Nan::New(ss.str().c_str()).ToLocalChecked());
  }

  static NAN_GETTER(GetShape) {
    UNWRAP;
    info.GetReturnValue().Set(ToArray(blob_->shape()));
  }

  static NAN_SETTER(SetShape) {
    UNWRAP;
    blob_->Reshape(FromArray<int>(value));
  }

  static NAN_GETTER(GetData) {
    UNWRAP;
    info.GetReturnValue().Set(NewTypedArray((Dtype)0, ToBuffer(blob_->data(), blob_->count() * sizeof(Dtype)), 0, blob_->count()));
  }

  static NAN_GETTER(GetDiff) {
    UNWRAP;
    info.GetReturnValue().Set(NewTypedArray((Dtype)0, ToBuffer(blob_->diff(), blob_->count() * sizeof(Dtype)), 0, blob_->count()));
  }

  static NAN_GETTER(GetDataBuffer) {
    UNWRAP;
    info.GetReturnValue().Set(ToBuffer(blob_->data(), blob_->count() * sizeof(Dtype)));
  }

  static NAN_GETTER(GetDiffBuffer) {
    UNWRAP;
    info.GetReturnValue().Set(ToBuffer(blob_->diff(), blob_->count() * sizeof(Dtype)));
  }

  #undef UNWRAP

  static Persistent<FunctionTemplate> ctor_;
  static Persistent<Function> ctor_instance_;

  shared_ptr<caffe::Blob<Dtype> > blob_;
};

template <typename T>
Persistent<FunctionTemplate> Blob<T>::ctor_;

template <typename T>
Persistent<Function> Blob<T>::ctor_instance_;

template <typename Dtype>
static Local<Value> ToValue(shared_ptr<caffe::Blob<Dtype> > blob) {
  return Blob<Dtype>::Create(blob);
}

template <typename Dtype>
static Local<Value> ToValue(caffe::Blob<Dtype>* blob) {
  return Blob<Dtype>::Create(blob);
}

template <typename Dtype>
static void FromValue(Local<Value> val, shared_ptr<caffe::Blob<Dtype> >& b) {
  b = nullptr;
  if (val->IsObject())
    b = Blob<Dtype>::Cast(val->ToObject());
}

// Node wrapper class for Layers. Note: enqueue and queueLength are only supported for
// 'BufferedData' layers and will throw for all other layer types.
template <typename Dtype>
class Layer : public ObjectWrap {
public:
  explicit Layer() : layer_(nullptr) {
  }

  explicit Layer(shared_ptr<caffe::Layer<Dtype> > existing) : layer_(existing) {
  }

  static Local<String> class_name() {
    return CLASS_NAME("Layer", Dtype);
  }

  static NAN_MODULE_INIT(Init) {
    Local<FunctionTemplate> ctor = Nan::New<FunctionTemplate>(New);
    ctor_.Reset(ctor);

    ctor->SetClassName(class_name());
    ctor->InstanceTemplate()->SetInternalFieldCount(1);
    Local<ObjectTemplate> proto = ctor->PrototypeTemplate();

    SetPrototypeMethod(ctor, "toString", ToString);
    SetPrototypeMethod(ctor, "enqueue", Enqueue);

    SetAccessor(proto, ToValue("param"), GetParam);
    SetAccessor(proto, ToValue("type"), GetType);
    SetAccessor(proto, ToValue("blobs"), GetBlobs);
    SetAccessor(proto, ToValue("queueLength"), GetQueueLength);

    ctor_instance_.Reset(ctor->GetFunction());
    Set(target, class_name(), ctor->GetFunction());
  }

  static Local<Value> Create(shared_ptr<caffe::Layer<Dtype> > layer) {
    EscapableHandleScope scope;
    MaybeLocal<Object> instance = Nan::NewInstance(Nan::New(ctor_instance_));
    Layer* obj = new Layer(layer);
    obj->Wrap(instance.ToLocalChecked());
    return scope.Escape(instance.ToLocalChecked());
  }

private:
  static NAN_METHOD(New) {
    if (info.IsConstructCall()) {
      Layer *obj = new Layer();
      obj->Wrap(info.This());
      info.GetReturnValue().Set(info.This());
    }
  }

  #define UNWRAP \
    if (!Nan::New(ctor_)->HasInstance(info.This())) \
      return; \
    shared_ptr<caffe::Layer<Dtype> > layer_(Unwrap<Layer>(info.This())->layer_); \
    if (!layer_) \
      return;

  static NAN_METHOD(ToString) {
    UNWRAP;
    stringstream ss;
    ss << "Layer" << TypeName<Dtype>() << " (" << layer_->type() << ")";
    info.GetReturnValue().Set(Nan::New(ss.str().c_str()).ToLocalChecked());
  }

  static NAN_METHOD(Enqueue) {
    UNWRAP;
    if (strcmp(layer_->type(), "BufferedDataLayer"))
      return ThrowTypeError("enqueue only permitted on 'BufferedDataLayer' layers");
    vector<shared_ptr<caffe::Blob<Dtype> > > blobs = FromArray<shared_ptr<caffe::Blob<Dtype> > >(Arg(info, 0));
    caffe::BufferedDataLayer<Dtype> *layer = reinterpret_cast<caffe::BufferedDataLayer<Dtype >*>(&*layer_);
    layer->Enqueue(blobs);
  }

  static NAN_GETTER(GetQueueLength) {
    UNWRAP;
    if (strcmp(layer_->type(), "BufferedDataLayer"))
      return ThrowTypeError("enqueue only permitted on 'BufferedDataLayer' layers");
    caffe::BufferedDataLayer<Dtype> *layer = reinterpret_cast<caffe::BufferedDataLayer<Dtype >*>(&*layer_);
    info.GetReturnValue().Set(uint32_t(layer->QueueLength()));
  }

  static NAN_GETTER(GetParam) {
    UNWRAP;
    string s;
    TextFormat::PrintToString(layer_->layer_param(), &s);
    info.GetReturnValue().Set(ToValue(s));
  }

  static NAN_GETTER(GetType) {
    UNWRAP;
    info.GetReturnValue().Set(Nan::New(layer_->type()).ToLocalChecked());
  }

  static NAN_GETTER(GetBlobs) {
    UNWRAP;
    info.GetReturnValue().Set(ToArray(layer_->blobs()));
  }

  #undef UNWRAP

  static Persistent<FunctionTemplate> ctor_;
  static Persistent<Function> ctor_instance_;

  shared_ptr<caffe::Layer<Dtype>> layer_;
};

template <typename T>
Persistent<FunctionTemplate> Layer<T>::ctor_;

template <typename T>
Persistent<Function> Layer<T>::ctor_instance_;

template <typename Dtype>
static Local<Value> ToValue(shared_ptr<caffe::Layer<Dtype> > layer) {
  return Layer<Dtype>::Create(layer);
}

template <typename T, typename IN_T, typename OUT_T>
class Worker : public AsyncWorker {
public:
  void HandleOKCallback() {
    if (callback) {
      Nan::HandleScope scope;
      Local<Value> argv[2] = { Nan::Null(), ToValue(output_)};
      callback->Call(2, argv);
    }
  }

  void Execute() {
    // Inherit GPU settings fro the main thread
    Caffe::set_mode(gpu_mode_);
    if (gpu_mode_ == Caffe::Brew::GPU)
      Caffe::SetDevice(gpu_device_);
    op_(&*handle_, input_);
  }

  Worker(Nan::Callback* callback, shared_ptr<T> handle, OUT_T (*op)(T *, IN_T), Local<Value> input) :
    AsyncWorker(callback),
    handle_(handle), op_(op) {
    FromValue(input, input_);
  }

  ~Worker() {}

private:
  shared_ptr<T> handle_;
  IN_T input_;
  OUT_T output_;
  OUT_T (*op_)(T *, IN_T);
};

// Node wrapper for Net objects.

template <typename Dtype>
class Net : public ObjectWrap {
public:
  explicit Net() : net_(nullptr) {
  }

  explicit Net(shared_ptr<caffe::Net<Dtype> > existing) : net_(existing) {
  }

  explicit Net(const char *config, const char *phase) :
    net_(new caffe::Net<Dtype>(string(config), !strcasecmp(phase, "train") ? caffe::TRAIN : caffe::TEST)) {
  }

  static Local<String> class_name() {
    return CLASS_NAME("Net", Dtype);
  }

  static NAN_MODULE_INIT(Init) {
    Local<FunctionTemplate> ctor = Nan::New<FunctionTemplate>(New);
    ctor_.Reset(ctor);

    ctor->SetClassName(class_name());
    ctor->InstanceTemplate()->SetInternalFieldCount(1);
    Local<ObjectTemplate> proto = ctor->PrototypeTemplate();

    SetPrototypeMethod(ctor, "toString", ToString);
    SetPrototypeMethod(ctor, "copyTrainedLayersFrom", CopyTrainedLayersFrom);
    SetPrototypeMethod(ctor, "forward", Forward);
    SetPrototypeMethod(ctor, "forwardSync", ForwardSync);
    SetPrototypeMethod(ctor, "backward", Backward);
    SetPrototypeMethod(ctor, "backwardSync", BackwardSync);
    SetPrototypeMethod(ctor, "snapshot", Snapshot);

    SetAccessor(proto, ToValue("name"), GetName);
    SetAccessor(proto, ToValue("phase"), GetPhase);
    SetAccessor(proto, ToValue("layer_names"), GetLayerNames);
    SetAccessor(proto, ToValue("blob_names"), GetBlobNames);
    SetAccessor(proto, ToValue("blobs"), GetBlobs);
    SetAccessor(proto, ToValue("layers"), GetLayers);
    SetAccessor(proto, ToValue("params"), GetParams);
    SetAccessor(proto, ToValue("num_inputs"), GetNumInputs);
    SetAccessor(proto, ToValue("num_outputs"), GetNumOutputs);
    SetAccessor(proto, ToValue("output_blobs"), GetOutputBlobs);

    ctor_instance_.Reset(ctor->GetFunction());
    Set(target, class_name(), ctor->GetFunction());
  }

  static Local<Value> Create(shared_ptr<caffe::Net<Dtype> > net) {
    EscapableHandleScope scope;
    MaybeLocal<Object> instance = Nan::NewInstance(Nan::New(ctor_instance_));
    Net* obj = new Net(net);
    obj->Wrap(instance.ToLocalChecked());
    return scope.Escape(instance.ToLocalChecked());
  }

private:
  static NAN_METHOD(New) {
    if (info.IsConstructCall()) {
      Net *obj;
      if (info.Length() >= 2) {
        String::Utf8Value file(info[0]->ToString());
        String::Utf8Value phase(info[1]->ToString());
        obj = new Net(*file, *phase);
      } else {
        obj = new Net();
      }
      obj->Wrap(info.This());
      info.GetReturnValue().Set(info.This());
    } else {
      const int argc = 2;
      Local<Value> argv[argc] = {info[0], info[1]};
      MaybeLocal<Function> fun = Nan::New(ctor_instance_);
      info.GetReturnValue().Set(Nan::NewInstance(fun.ToLocalChecked(), argc, argv).ToLocalChecked());
    }
  }

  #define UNWRAP \
    if (!Nan::New(ctor_)->HasInstance(info.This())) \
      return; \
    shared_ptr<caffe::Net<Dtype> > net_(Unwrap<Net>(info.This())->net_)

  static NAN_METHOD(ToString) {
    UNWRAP;
    stringstream ss;
    ss << "Net" << TypeName<Dtype>() << " (" << net_->name() << ")";
    info.GetReturnValue().Set(Nan::New(ss.str().c_str()).ToLocalChecked());
  }

  static NAN_METHOD(CopyTrainedLayersFrom) {
    UNWRAP;
    String::Utf8Value file(info[0]->ToString());
    net_->CopyTrainedLayersFrom(string(*file));
  }

  static NAN_GETTER(GetName) {
    UNWRAP;
    info.GetReturnValue().Set(ToValue(net_->name().c_str()));
  }

  static NAN_GETTER(GetPhase) {
    UNWRAP;
    info.GetReturnValue().Set(ToValue((net_->phase() == caffe::TRAIN) ? "train" : "test"));
  }

  static NAN_GETTER(GetLayerNames) {
    UNWRAP;
    info.GetReturnValue().Set(ToArray(net_->layer_names()));
  }

  static NAN_GETTER(GetBlobNames) {
    UNWRAP;
    info.GetReturnValue().Set(ToArray(net_->blob_names()));
  }

  static NAN_GETTER(GetBlobs) {
    UNWRAP;
    info.GetReturnValue().Set(ToArray(net_->blobs()));
  }

  static NAN_GETTER(GetLayers) {
    UNWRAP;
    info.GetReturnValue().Set(ToArray(net_->layers()));
  }

  static NAN_GETTER(GetParams) {
    UNWRAP;
    info.GetReturnValue().Set(ToArray(net_->params()));
  }

  static NAN_GETTER(GetNumInputs) {
    UNWRAP;
    info.GetReturnValue().Set(net_->num_inputs());
  }

  static NAN_GETTER(GetNumOutputs) {
    UNWRAP;
    info.GetReturnValue().Set(net_->num_inputs());
  }

  static double CallForward(caffe::Net<Dtype> *net, Void v) {
    Dtype loss;
    net->Forward(&loss);
    return loss;
  }

  static NAN_METHOD(Forward) {
    UNWRAP;
    Local<Value> fun = Arg(info, 0);
    Nan::Callback *callback = fun->IsFunction() ? new Nan::Callback(fun.As<Function>()) : nullptr;
    Nan::AsyncQueueWorker(new Worker<caffe::Net<Dtype>, Void, double>(callback, net_, CallForward, Undefined()));
  }

  static NAN_METHOD(ForwardSync) {
    UNWRAP;
    Dtype loss;
    net_->Forward(&loss);
    info.GetReturnValue().Set(loss);
  }

  static Void CallBackward(caffe::Net<Dtype> *net, Void v) {
    net->Backward();
    return Void();
  }

  static NAN_METHOD(Backward) {
    UNWRAP;
    Local<Value> fun = Arg(info, 0);
    Nan::Callback *callback = fun->IsFunction() ? new Nan::Callback(fun.As<Function>()) : nullptr;
    Nan::AsyncQueueWorker(new Worker<caffe::Net<Dtype>, Void, Void>(callback, net_, CallBackward, Undefined()));
  }

  static NAN_METHOD(BackwardSync) {
    UNWRAP;
    net_->Backward();
  }

  static NAN_METHOD(Snapshot) {
    UNWRAP;
    String::Utf8Value file(info[0]->ToString());
    string model_filename = string(*file);
    caffe::NetParameter net_param;
    net_->ToProto(&net_param, false);
    caffe::WriteProtoToBinaryFile(net_param, model_filename);
  }

  static NAN_GETTER(GetOutputBlobs) {
    UNWRAP;
    info.GetReturnValue().Set(ToArray(net_->output_blobs()));
  }

  #undef UNWRAP

  static Persistent<FunctionTemplate> ctor_;
  static Persistent<Function> ctor_instance_;

  shared_ptr<caffe::Net<Dtype> > net_;
};

template <typename T>
Persistent<FunctionTemplate> Net<T>::ctor_;

template <typename T>
Persistent<Function> Net<T>::ctor_instance_;

template <typename Dtype>
static Local<Value> ToValue(shared_ptr<caffe::Net<Dtype> > net) {
  return Net<Dtype>::Create(net);
}

// Node wrapper for Solver objects.

template <typename Dtype>
class Solver : public ObjectWrap {
public:
  explicit Solver(const char *config) {
    caffe::SolverParameter param;
    caffe::ReadSolverParamsFromTextFileOrDie(string(config), &param);
    shared_ptr<caffe::Solver<Dtype> > solver(caffe::SolverRegistry<Dtype>::CreateSolver(param));
    solver_ = solver;
    sync_ = NULL;
  }

  static Local<String> class_name() {
    return CLASS_NAME("Solver", Dtype);
  }

  static NAN_MODULE_INIT(Init) {
    Local<FunctionTemplate> ctor = Nan::New<FunctionTemplate>(New);
    ctor_.Reset(ctor);

    ctor->SetClassName(class_name());
    ctor->InstanceTemplate()->SetInternalFieldCount(1);
    Local<ObjectTemplate> proto = ctor->PrototypeTemplate();

    SetPrototypeMethod(ctor, "toString", ToString);
    SetPrototypeMethod(ctor, "solve", Solve);
    SetPrototypeMethod(ctor, "step", Step);
    SetPrototypeMethod(ctor, "stepSync", StepSync);
    SetPrototypeMethod(ctor, "snapshot", Snapshot);
    SetPrototypeMethod(ctor, "restore", Restore);
    SetPrototypeMethod(ctor, "done", Done);

    SetAccessor(proto, ToValue("param"), GetParam);
    SetAccessor(proto, ToValue("type"), GetType);
    SetAccessor(proto, ToValue("iter"), GetIter);
    SetAccessor(proto, ToValue("net"), GetNet);
    SetAccessor(proto, ToValue("test_nets"), GetTestNets);

    ctor_instance_.Reset(ctor->GetFunction());
    Set(target, class_name(), ctor->GetFunction());
  }

private:
  static NAN_METHOD(New) {
    if (info.IsConstructCall()) {
      String::Utf8Value file(Arg(info, 0)->ToString());
      Solver *obj = new Solver(*file);
      obj->Wrap(info.This());
      info.GetReturnValue().Set(info.This());
    } else {
      const int argc = 1;
      Local<Value> argv[argc] = {info[0]};
      MaybeLocal<Function> fun = Nan::New(ctor_instance_);
      info.GetReturnValue().Set(Nan::NewInstance(fun.ToLocalChecked(), argc, argv).ToLocalChecked());
    }
  }

  #define UNWRAP \
    if (!Nan::New(ctor_)->HasInstance(info.This())) \
      return; \
    Solver* obj_(Unwrap<Solver>(info.This())); \
    shared_ptr<caffe::Solver<Dtype> > solver_(obj_->solver_);

  static NAN_METHOD(ToString) {
    UNWRAP;
    stringstream ss;
    ss << "Solver" << TypeName<Dtype>() << " (" << solver_->type() << ")";
    info.GetReturnValue().Set(Nan::New(ss.str().c_str()).ToLocalChecked());
  }

  static NAN_GETTER(GetParam) {
    UNWRAP;
    string s;
    TextFormat::PrintToString(solver_->param(), &s);
    info.GetReturnValue().Set(ToValue(s));
  }

  static NAN_GETTER(GetType) {
    UNWRAP;
    info.GetReturnValue().Set(Nan::New(solver_->type()).ToLocalChecked());
  }

  static NAN_GETTER(GetIter) {
    UNWRAP;
    info.GetReturnValue().Set(ToValue(solver_->iter()));
  }

  static NAN_GETTER(GetNet) {
    UNWRAP;
    info.GetReturnValue().Set(Net<Dtype>::Create(solver_->net()));
  }

  static NAN_GETTER(GetTestNets) {
    UNWRAP;
    info.GetReturnValue().Set(ToArray(solver_->test_nets()));
  }

  static NAN_METHOD(Solve) {
    UNWRAP;
    vector<int> gpus;
    get_gpus(&gpus);

    if ((gpus.size() > 1) && (Caffe::solver_count() > 1)) {
      caffe::P2PSync<Dtype> sync(solver_, NULL, solver_->param());
      sync.Run(gpus);
    } else {
      LOG(INFO) << "Starting Optimization";
      solver_->Solve();
    }
  }

  static Void CallStep(caffe::Solver<Dtype> *solver, int steps) {
    solver->Step(steps);
    return Void();
  }

  static NAN_METHOD(Step) {
    UNWRAP;
    Local<Value> fun = Arg(info, 1);
    Nan::Callback *callback = fun->IsFunction() ? new Nan::Callback(fun.As<Function>()) : nullptr;
    Nan::AsyncQueueWorker(new Worker<caffe::Solver<Dtype>, int, Void>(callback, solver_, &CallStep, Arg(info, 0)));
  }

  static NAN_METHOD(StepSync) {
    UNWRAP;
    if (Arg(info, 0)->IsInt32()) {
      int stepCount = Arg(info, 0)->IntegerValue();

      vector<int> gpus;
      get_gpus(&gpus);

      if ((gpus.size() > 1) && (Caffe::solver_count() > 1)) {
        if (obj_->sync_ == NULL) {
          LOG(INFO) << "Instantiating GPU workers";
          obj_->sync_.reset(new caffe::P2PSync<Dtype>(obj_->solver_, NULL,
                                                      obj_->solver_->param()));
          obj_->gpuWorkers_.resize(Caffe::solver_count());
          obj_->sync_->Prepare(gpus, &obj_->gpuWorkers_);

          for (int i = 1; i < obj_->gpuWorkers_.size(); ++i) {
            obj_->gpuWorkers_[i]->StartInternalThread();
          }
          LOG(INFO) << "Starting Optimization";
        }
        obj_->solver_->Step(stepCount);
      } else {
        obj_->solver_->Step(stepCount);
      }
    }
  }

  static NAN_METHOD(Done) {
    UNWRAP;
    if (obj_->sync_ == NULL) {
      return;
    }

    for (int i = 1; i < obj_->gpuWorkers_.size(); ++i) {
      obj_->gpuWorkers_[i]->StopInternalThread();
    }
    LOG(INFO)<< "Optimization done.";
 }

  static NAN_METHOD(Snapshot) {
    UNWRAP;
    solver_->Snapshot();
  }

  static NAN_METHOD(Restore) {
    UNWRAP;
    String::Utf8Value file(Arg(info, 0)->ToString());
    solver_->Restore(*file);
  }

  #undef UNWRAP

  static Persistent<FunctionTemplate> ctor_;
  static Persistent<Function> ctor_instance_;

  shared_ptr<caffe::Solver<Dtype> > solver_;
  shared_ptr<caffe::P2PSync<Dtype> > sync_;
  vector<shared_ptr<caffe::P2PSync<Dtype> > > gpuWorkers_;
};

template <typename T>
Persistent<FunctionTemplate> Solver<T>::ctor_;

template <typename T>
Persistent<Function> Solver<T>::ctor_instance_;

// module.mode = 'GPU' || 'CPU'

static NAN_GETTER(GetMode) {
  string mode((Caffe::mode() == Caffe::Brew::GPU) ? "GPU" : "CPU");
  info.GetReturnValue().Set(Nan::New(mode.c_str()).ToLocalChecked());
}

static NAN_SETTER(SetMode) {
  if (value->IsString()) {
    String::Utf8Value str(value);
    Caffe::set_mode(gpu_mode_ = ((!strcasecmp(*str, "GPU") ? Caffe::GPU : Caffe::CPU)));
  }
}

static NAN_GETTER(GetGpus) {
  info.GetReturnValue().Set(ToValue(num_gpus()));
}

static NAN_METHOD(DeviceQuery) {
#ifndef CPU_ONLY
  int count = num_gpus();

  Local<Array> result = Nan::New<Array>(count);
  for (int i = 0; i < count; ++i) {
    caffe::Caffe::SetDevice(i);
    cudaDeviceProp prop;
    int device;
    if (cudaSuccess != cudaGetDevice(&device)) {
      printf("No cuda device present.\n");
      return;
    }
    CUDA_CHECK(cudaGetDeviceProperties(&prop, device));
    Local<Object> deviceObj = Nan::New<Object>();
    deviceObj->Set(Nan::New("id").ToLocalChecked(), Nan::New(i));
    deviceObj->Set(Nan::New("major").ToLocalChecked(), Nan::New(prop.major));

    deviceObj->Set(Nan::New("minor").ToLocalChecked(), Nan::New(prop.minor));
    deviceObj->Set(Nan::New("name").ToLocalChecked(), Nan::New(prop.name).ToLocalChecked());
    deviceObj->Set(Nan::New("totalGlobalMem").ToLocalChecked(), Nan::New(double(prop.totalGlobalMem)));
    deviceObj->Set(Nan::New("sharedMemPerBlock").ToLocalChecked(), Nan::New(double(prop.sharedMemPerBlock)));
    deviceObj->Set(Nan::New("regsPerBlock").ToLocalChecked(), Nan::New(prop.regsPerBlock));
    deviceObj->Set(Nan::New("warpSize").ToLocalChecked(), Nan::New(prop.warpSize));
    deviceObj->Set(Nan::New("memPitch").ToLocalChecked(), Nan::New(double(prop.memPitch)));
    deviceObj->Set(Nan::New("maxThreadsPerBlock").ToLocalChecked(), Nan::New(prop.maxThreadsPerBlock));
    deviceObj->Set(Nan::New("clockRate").ToLocalChecked(), Nan::New(prop.clockRate));
    deviceObj->Set(Nan::New("totalConstMem").ToLocalChecked(), Nan::New(double(prop.totalConstMem)));
    deviceObj->Set(Nan::New("textureAlignment").ToLocalChecked(), Nan::New(double(prop.textureAlignment)));
    deviceObj->Set(Nan::New("deviceOverlap").ToLocalChecked(), Nan::New(prop.deviceOverlap));
    deviceObj->Set(Nan::New("multiProcessorCount").ToLocalChecked(), Nan::New(prop.multiProcessorCount));
    deviceObj->Set(Nan::New("kernelExecTimeoutEnabled").ToLocalChecked(), Nan::New(prop.kernelExecTimeoutEnabled));
    Local<Array> maxThreadsDim = Nan::New<Array>(3);
    maxThreadsDim->Set(0, Nan::New(prop.maxThreadsDim[0]));
    maxThreadsDim->Set(1, Nan::New(prop.maxThreadsDim[1]));
    maxThreadsDim->Set(2, Nan::New(prop.maxThreadsDim[2]));
    deviceObj->Set(Nan::New("maxThreadsDim").ToLocalChecked(), maxThreadsDim);

    Local<Array> maxGridSize = Nan::New<Array>(3);
    maxGridSize->Set(0, Nan::New(prop.maxGridSize[0]));
    maxGridSize->Set(1, Nan::New(prop.maxGridSize[1]));
    maxGridSize->Set(2, Nan::New(prop.maxGridSize[2]));
    deviceObj->Set(Nan::New("maxGridSize").ToLocalChecked(), maxGridSize);

    result->Set(i, deviceObj);
  }
  info.GetReturnValue().Set(result);
#endif
}

static NAN_SETTER(SetDevice) {
  if (value->IsNumber()) {
    int device = value->IntegerValue();
    LOG(INFO) << "Using GPU " << device;
    Caffe::SetDevice(gpu_device_ = device);
  }
}

static NAN_SETTER(SetSolverCount) {
  if (value->IsNumber()) {
    int gpuSize = value->IntegerValue();
    Caffe::set_solver_count(gpuSize);
  }
}

void InitAll(Handle<Object> exports) {
  SetAccessor(exports, ToValue("mode"), GetMode, SetMode);
  SetAccessor(exports, ToValue("gpus"), GetGpus);
  SetAccessor(exports, ToValue("device"), 0, SetDevice);
  SetAccessor(exports, ToValue("solverCount"), 0, SetSolverCount);
  SetMethod(exports, "deviceQuery", DeviceQuery);

  Blob<float>::Init(exports);
  Blob<double>::Init(exports);
  Layer<float>::Init(exports);
  Layer<double>::Init(exports);
  Net<float>::Init(exports);
  Net<double>::Init(exports);
  Solver<float>::Init(exports);
  Solver<double>::Init(exports);

  // default to float Dtype
  Set(exports, ToValue("Blob"), Get(exports, ToValue("BlobFloat")).ToLocalChecked());
  Set(exports, ToValue("Layer"), Get(exports, ToValue("LayerFloat")).ToLocalChecked());
  Set(exports, ToValue("Net"), Get(exports, ToValue("NetFloat")).ToLocalChecked());
  Set(exports, ToValue("Solver"), Get(exports, ToValue("SolverFloat")).ToLocalChecked());
}

NODE_MODULE(Caffe, InitAll);
