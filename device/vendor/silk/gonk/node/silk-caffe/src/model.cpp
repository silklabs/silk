/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#define LOG_TAG "silk-caffe"
#include <utils/Log.h>
#include <vector>
#include <algorithm>
#include <iosfwd>
#include <memory>
#include <utility>

#include "model.h"
#include "caffe/layers/memory_data_layer.hpp"

Nan::Persistent<Function> Model::constructor;

/**
 *
 */
static bool PairCompare(const pair<float, int>& lhs,
    const pair<float, int>& rhs) {
  return lhs.first > rhs.first;
}

/**
 * Return the indices of the top N values of vector v
 */
static vector<int> Argmax(const vector<float>& v, int N) {
  vector<pair<float, int> > pairs;
  for (size_t i = 0; i < v.size(); ++i) {
    pairs.push_back(make_pair(v[i], i));
  }
  partial_sort(pairs.begin(), pairs.begin() + N, pairs.end(), PairCompare);

  vector<int> result;
  for (int i = 0; i < N; ++i) {
    result.push_back(pairs[i].second);
  }
  return result;
}

/**
 *
 */
void Model::Init(Local<Object> exports) {
  Nan::HandleScope scope;

  // Prepare constructor template
  Local<FunctionTemplate> ctor = Nan::New<FunctionTemplate>(New);
  ctor->SetClassName(Nan::New("Model").ToLocalChecked());
  ctor->InstanceTemplate()->SetInternalFieldCount(1);

  // Prototype
  Nan::SetPrototypeMethod(ctor, "load", Load);
  Nan::SetPrototypeMethod(ctor, "setMean", SetMean);
  Nan::SetPrototypeMethod(ctor, "setScale", SetScale);
  Nan::SetPrototypeMethod(ctor, "setLabels", SetLabels);
  Nan::SetPrototypeMethod(ctor, "predictTopK", PredictTopK);

  constructor.Reset(ctor->GetFunction());
  exports->Set(Nan::New("Model").ToLocalChecked(), ctor->GetFunction());
}

/**
 *
 */
NAN_METHOD(Model::New) {
  if (info.IsConstructCall()) {
    // Invoked as constructor: `new Model(...)`
    Model* obj = new Model();
    obj->Wrap(info.This());
    info.GetReturnValue().Set(info.This());
  } else {
    // Invoked as plain function `Model(...)`, turn into construct call.
    Local<Function> cons = Nan::New<Function>(constructor);
    info.GetReturnValue().Set(cons->NewInstance());
  }
}

/**
 *
 */
Model::Model() :
  mScale(0.0) {
}

/**
 *
 */
Model::~Model() {
  mCaffeNet.reset();
}

/**
 * Async wrapper for load API
 */
class LoadAsyncWorker: public Nan::AsyncWorker {
public:
  LoadAsyncWorker(Nan::Callback *callback, Model* model,
      string modelPath, string weightsPath) :
    Nan::AsyncWorker(callback),
    model(model),
    modelPath(modelPath),
    weightsPath(weightsPath) {
  }

  void Execute() {
    Caffe::set_mode(Caffe::CPU);

    clock_t t_start = clock();
    model->mCaffeNet.reset(new Net<float>(modelPath, caffe::TEST));
    model->mCaffeNet->CopyTrainedLayersFrom(weightsPath);
    clock_t t_end = clock();
    ALOGD("Loading time: %fms", 1000.0 * (t_end - t_start) / CLOCKS_PER_SEC);

    if (model->mCaffeNet->num_inputs() != 1) {
      SetErrorMessage("Network should have exactly one input");
      return;
    }

    if (model->mCaffeNet->num_outputs() != 1) {
      SetErrorMessage("Network should have exactly one output");
      return;
    }

    Blob<float> *inputLayer = model->mCaffeNet->input_blobs()[0];
    model->mNumChannels = inputLayer->channels();
    if ((model->mNumChannels != 3) && (model->mNumChannels != 1)) {
      SetErrorMessage("Input layer should have 1 or 3 channels");
      return;
    }

    model->mInputGeometry = cv::Size(inputLayer->width(), inputLayer->height());
  }

private:
  Model* model;
  string modelPath;
  string weightsPath;
};

/**
 * Loads the provided model asynchronously
 */
NAN_METHOD(Model::Load) {
  SETUP_FUNCTION(Model)

  if (info.Length() != 3) {
    JSTHROW("Invalid number of arguments provided");
  }

  string modelPath;
  STRING_FROM_ARGS(modelPath, 0);

  string weightsPath;
  STRING_FROM_ARGS(weightsPath, 1);

  REQ_FUN_ARG(2, cb);

  Nan::Callback *callback = new Nan::Callback(cb.As<Function>());
  Nan::AsyncQueueWorker(new LoadAsyncWorker(callback, self, modelPath,
      weightsPath));
}

/**
 * Load the mean file for the network
 */
NAN_METHOD(Model::SetMean) {
  SETUP_FUNCTION(Model)

  if (info.Length() == 0) {
    JSTHROW("Mean filename must be provided");
  }

  string meanFile;
  STRING_FROM_ARGS(meanFile, 0);

  BlobProto blobProto;
  ReadProtoFromBinaryFileOrDie(meanFile.c_str(), &blobProto);

  // Convert from BlobProto to Blob<float>
  Blob<float> meanBlob;
  meanBlob.FromProto(blobProto);
  if (meanBlob.channels() != self->mNumChannels) {
    JSTHROW("Number of channels of mean file doesn't match input layer");
  }

  // The format of the mean file is planar 32-bit float BGR or grayscale
  vector<cv::Mat> channels;
  float *data = meanBlob.mutable_cpu_data();
  for (int i = 0; i < self->mNumChannels; ++i) {
    // Extract an individual channel
    cv::Mat channel(meanBlob.height(), meanBlob.width(), CV_32FC1, data);
    channels.push_back(channel);
    data += meanBlob.height() * meanBlob.width();
  }

  // Merge the separate channels into a single image
  cv::Mat mean;
  cv::merge(channels, mean);

  // Compute the global mean pixel value and create a mean image
  // filled with this value
  cv::Scalar channelMean = cv::mean(mean);
  self->mMean = cv::Mat(self->mInputGeometry, mean.type(), channelMean);
}

/**
 *
 */
NAN_METHOD(Model::SetScale) {
  SETUP_FUNCTION(Model)

  if (info.Length() == 0) {
    JSTHROW("Scale must be provided");
  }

  int scale = 0;
  INT_FROM_ARGS(scale, 0);
  if (scale <= 0) {
    JSTHROW("Scale must be greater than zero");
  }

  self->mScale = scale;
}

/**
 * Load labels
 */
NAN_METHOD(Model::SetLabels) {
  SETUP_FUNCTION(Model)

  if (info.Length() == 0) {
    JSTHROW("Label filename must be provided");
  }

  string labelFile;
  STRING_FROM_ARGS(labelFile, 0);

  ifstream labels(labelFile.c_str());
  if (!labels) {
    JSTHROW("Unable to open labels file");
  }

  string line;
  int count = 0;
  while (std::getline(labels, line)) {
    self->mLabels.push_back(line);
  }

  Blob<float>* outputLayer = self->mCaffeNet->output_blobs()[0];
  if (self->mLabels.size() != outputLayer->channels()) {
    ALOGD("Labels size: %d channels: %d", self->mLabels.size(),
        outputLayer->channels());
    JSTHROW("Number of labels is different from the output layer dimension");
  }
}

/**
 * Async wrapper for predictTopK API
 */
class PredictAsyncWorker: public Nan::AsyncWorker {
public:
  PredictAsyncWorker(Nan::Callback *callback, Model* model,
      string imagePath, int topK) :
    Nan::AsyncWorker(callback),
    model(model),
    imagePath(imagePath),
    topK(topK) {
  }

  void Execute() {
    cv::Mat img = cv::imread(imagePath, -1);
    if (img.empty()) {
      SetErrorMessage("Unable to decode image");
      return;
    }

    output = model->Predict(img);
    topK = min<int>(model->mLabels.size(), topK);
    maxK = Argmax(output, topK);
  }

  void HandleOKCallback() {
    Local<Array> predictions = Nan::New<Array>(topK);
    for (int i = 0; i < topK; ++i) {
      int idx = maxK[i];
      Local<Object> prediction = Nan::New<Object>();
      prediction->Set(Nan::New<String>("label").ToLocalChecked(),
          Nan::New<String>(model->mLabels[idx]).ToLocalChecked());
      prediction->Set(Nan::New<String>("confidence").ToLocalChecked(),
          Nan::New<Number>(output[idx]));
      predictions->Set(i, prediction);
    }

    Local<Value> argv[2];
    argv[0] = Nan::Null();
    argv[1] = predictions;

    Nan::TryCatch try_catch;
    callback->Call(2, argv);
    if (try_catch.HasCaught()) {
      Nan::FatalException(try_catch);
    }
  }

private:
  Model* model;
  string imagePath;
  int topK;
  vector<float> output;
  vector<int> maxK;
};


/**
 * Return the top K predictions for the provided image asynchronously
 */
NAN_METHOD(Model::PredictTopK) {
  SETUP_FUNCTION(Model)

  if (info.Length() < 3) {
    JSTHROW("Image filename and callback function must be provided");
  }

  string imagePath;
  STRING_FROM_ARGS(imagePath, 0);

  int topK = 0;
  if (info.Length() > 1) {
    INT_FROM_ARGS(topK, 1);
  }

  REQ_FUN_ARG(2, cb);

  Nan::Callback *callback = new Nan::Callback(cb.As<Function>());
  Nan::AsyncQueueWorker(new PredictAsyncWorker(callback, self, imagePath,
      topK));
}

/**
 * Runs forward pass for the whole network
 */
vector<float> Model::Predict(const cv::Mat& img) {
  Blob<float>* inputLayer = mCaffeNet->input_blobs()[0];
  inputLayer->Reshape(1, mNumChannels, mInputGeometry.height,
      mInputGeometry.width);

  // Forward dimension change to all layers
  mCaffeNet->Reshape();

  vector<cv::Mat> inputChannels;
  WrapInputLayer(&inputChannels);

  Preprocess(img, &inputChannels);

  mCaffeNet->ForwardPrefilled();

  // Copy the output layer to a std::vector
  Blob<float>* output_layer = mCaffeNet->output_blobs()[0];
  const float* begin = output_layer->cpu_data();
  const float* end = begin + output_layer->channels();
  return vector<float>(begin, end);
}

/*
 * Wrap the input layer of the network in separate cv::Mat objects
 * (one per channel). This way we save one memcpy operation and we
 * don't need to rely on cudaMemcpy2D. The last pre-processing
 * operation will write the separate channels directly to the input
 * layer
 */
void Model::WrapInputLayer(std::vector<cv::Mat>* inputChannels) {
  Blob<float>* inputLayer = mCaffeNet->input_blobs()[0];

  int width = inputLayer->width();
  int height = inputLayer->height();
  float* inputData = inputLayer->mutable_cpu_data();
  for (int i = 0; i < inputLayer->channels(); ++i) {
    cv::Mat channel(height, width, CV_32FC1, inputData);
    inputChannels->push_back(channel);
    inputData += width * height;
  }
}

/**
 *
 */
void Model::Preprocess(const cv::Mat& img,
    std::vector<cv::Mat>* inputChannels) {
  // Convert the input image to the input image format of the network
  cv::Mat sample;
  if (img.channels() == 3 && mNumChannels == 1) {
    cv::cvtColor(img, sample, cv::COLOR_BGR2GRAY);
  } else if (img.channels() == 4 && mNumChannels == 1) {
    cv::cvtColor(img, sample, cv::COLOR_BGRA2GRAY);
  } else if (img.channels() == 4 && mNumChannels == 3) {
    cv::cvtColor(img, sample, cv::COLOR_BGRA2BGR);
  } else if (img.channels() == 1 && mNumChannels == 3) {
    cv::cvtColor(img, sample, cv::COLOR_GRAY2BGR);
  } else {
    sample = img;
  }

  cv::Mat sampleResized;
  if (sample.size() != mInputGeometry) {
    cv::resize(sample, sampleResized, mInputGeometry);
  } else {
    sampleResized = sample;
  }

  cv::Mat sampleFloat;
  if (mNumChannels == 3) {
    sampleResized.convertTo(sampleFloat, CV_32FC3);
  } else {
    sampleResized.convertTo(sampleFloat, CV_32FC1);
  }

  cv::Mat sampleNormalized;
  cv::subtract(sampleFloat, mMean, sampleNormalized);

  if (mScale > 0.0) {
    sampleNormalized *= mScale;
  }

  // This operation will write the separate BGR planes directly to the
  // input layer of the network because it is wrapped by the cv::Mat
  // objects in inputChannels
  cv::split(sampleNormalized, *inputChannels);

  if (reinterpret_cast<float*>(inputChannels->at(0).data)
      != mCaffeNet->input_blobs()[0]->cpu_data()) {
    JSTHROW("Input channels are not wrapping the input layer of the network");
  }
}

