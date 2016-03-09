/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#define LOG_TAG "silk-caffe"
#ifdef ANDROID
//#define LOG_NDEBUG 0
#include <utils/Log.h>
#else
#define ALOGV(fmt, args...) fprintf(stderr, LOG_TAG ": " fmt, ##args); fprintf(stderr, "\n");
#define ALOGE ALOGV
#define ALOGD ALOGV
#endif

#include <vector>
#include <algorithm>
#include <iosfwd>
#include <memory>
#include <utility>
#include <opencv2/imgproc.hpp>
#include <chrono>

#include "model.h"
#include "caffe/layers/memory_data_layer.hpp"
#include "Matrix.h"
#include "cvutils.h"

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
  Nan::SetPrototypeMethod(ctor, "rcnn", Rcnn);

  constructor.Reset(ctor->GetFunction());
  exports->Set(Nan::New("Model").ToLocalChecked(), ctor->GetFunction());
}

/**
 *
 */
NAN_METHOD(Model::New) {
  google::InitGoogleLogging(LOG_TAG);

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

    model->mCaffeNet.reset(new Net<float>(modelPath, caffe::TEST));
    model->mCaffeNet->CopyTrainedLayersFrom(weightsPath);

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
  ALOGV("Setting up caffe model.....");
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
  while (getline(labels, line)) {
    self->mLabels.push_back(line);
  }

  Blob<float>* outputLayer = self->mCaffeNet->output_blobs()[0];
  if (self->mLabels.size() != outputLayer->channels()) {
    ALOGD("Labels size: %lu channels: %d", self->mLabels.size(),
        outputLayer->channels());
    JSTHROW("Number of labels is different from the output layer dimension");
  }
}

/**
 * Async wrapper for predictTopK API
 */
class PredictAsyncWorker: public Nan::AsyncWorker {
public:
  PredictAsyncWorker(Nan::Callback *callback, Model* model, cv::Mat mat,
      int topK):
    Nan::AsyncWorker(callback),
    model(model),
    mat(mat),
    topK(topK) {
  }

  void Execute() {
    topK = min<int>(model->mLabels.size(), topK);
    mPredictions = model->Classify(mat, topK);
  }

  void HandleOKCallback() {
    Local<Array> predictions = Nan::New<Array>(topK);
    for (int i = 0; i < mPredictions.size(); ++i) {
      Local<Object> prediction = Nan::New<Object>();
      prediction->Set(Nan::New<String>("label").ToLocalChecked(),
          Nan::New<String>(mPredictions[i].first).ToLocalChecked());
      prediction->Set(Nan::New<String>("confidence").ToLocalChecked(),
          Nan::New<Number>(mPredictions[i].second));
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
  cv::Mat mat;
  int topK;
  vector<Prediction> mPredictions;
};

/**
 * Return the top K predictions for the provided image asynchronously
 */
NAN_METHOD(Model::PredictTopK) {
  SETUP_FUNCTION(Model)

  if (info.Length() < 3) {
    JSTHROW("Image matrix, topK and callback function must be provided");
  }

  cv::Mat mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(
      info[0]->ToObject())->mat;

  int topK = 0;
  INT_FROM_ARGS(topK, 1);

  REQ_FUN_ARG(2, cb);

  Nan::Callback *callback = new Nan::Callback(cb.As<Function>());
  Nan::AsyncQueueWorker(new PredictAsyncWorker(callback, self, mat, topK));
}

/**
 * Async wrapper for predictRegions API
 */
class RcnnAsyncWorker: public Nan::AsyncWorker {
public:
  RcnnAsyncWorker(Nan::Callback *callback, Model* model, cv::Mat mat,
      string className, vector<cv::Rect> motionRects, int minSize,
      int maxMergingIterations, float nmsThreshold, float confThreshold):
    Nan::AsyncWorker(callback),
    model(model),
    mat(mat),
    mClassName(className),
    mMotionRects(motionRects),
    mMinSize(minSize),
    mMaxMergingIterations(maxMergingIterations),
    mNmsThreshold(nmsThreshold),
    mConfThreshold(confThreshold) {
  }

  void Execute() {
    chrono::time_point<chrono::system_clock> start, end;
    chrono::duration<double> elapsed_seconds;

    // Run selective search to get all the regions of the image and run
    // prediction on each of the regions
    start = chrono::system_clock::now();
    dlib::matrix_range_exp<double> kvals = dlib::linspace(50, 200, 3);
    vector<cv::Rect> proposedRects = getObjectProposals(mat, kvals, mMinSize,
        mMaxMergingIterations);
    end = chrono::system_clock::now();
    elapsed_seconds = end - start;
    ALOGD("# object proposals: %lu in %f secs", proposedRects.size(),
          elapsed_seconds.count());

    // Only keep the proposed rectangles that intersect with motion rectangles
    start = chrono::system_clock::now();
    vector<cv::Rect> rects = boxIntersect(proposedRects, mMotionRects);
    end = chrono::system_clock::now();
    elapsed_seconds = end - start;
    ALOGD("# object proposals w/ motion: %lu in %f secs", rects.size(),
          elapsed_seconds.count());

    vector<CvRectScore> predictions;
    for (int count = 0; count < rects.size(); count++) {
      cv::Rect regionRect = rects[count];
      cv::Mat region = mat(regionRect);

      // Only return the top most prediction for the requested class
      vector<Prediction> prediction = model->Classify(region, 1);
      if (prediction[0].first == mClassName) {
        CvRectScore rectScore = {prediction[0].second, regionRect};
        // Only return the predictions with confidence higher than mConfThreshold
        if (prediction[0].second >= mConfThreshold) {
          predictions.push_back(rectScore);
          ALOGV("Prediction for region# %d %s score: %f rect: [%d, %d, %d, %d]",
              count, prediction[0].first.c_str(), prediction[0].second,
              regionRect.x, regionRect.y, regionRect.width, regionRect.height);
        }
      }
    }

    if (predictions.size() > 0) {
      start = chrono::system_clock::now();
      NMS(predictions, mRegions, mNmsThreshold);
      end = chrono::system_clock::now();
      elapsed_seconds = end - start;
      ALOGV("After NMS: # rects: %lu in %f secs", mRegions.size(),
            elapsed_seconds.count());
      for (vector<CvRectScore>::iterator it = mRegions.begin();
          it != mRegions.end(); ++it) {
        ALOGV("Rects: [%d, %d, %d, %d] score: %f", it->rect.x, it->rect.y,
              it->rect.width, it->rect.height, it->score);
      }
    }
  }

  void HandleOKCallback() {
    Local<Array> predictions = Nan::New<Array>(mRegions.size());
    for (int i = 0; i < mRegions.size(); ++i) {
      Local<Object> prediction = Nan::New<Object>();
      prediction->Set(Nan::New<String>("label").ToLocalChecked(),
          Nan::New<String>(mClassName).ToLocalChecked());
      prediction->Set(Nan::New<String>("confidence").ToLocalChecked(),
          Nan::New<Number>(mRegions[i].score));

      // Add region rectangle
      Local<Object> rect = Nan::New<Object>();
      rect->Set(Nan::New<String>("x").ToLocalChecked(),
          Nan::New<Number>(mRegions[i].rect.x));
      rect->Set(Nan::New<String>("y").ToLocalChecked(),
          Nan::New<Number>(mRegions[i].rect.y));
      rect->Set(Nan::New<String>("width").ToLocalChecked(),
          Nan::New<Number>(mRegions[i].rect.width));
      rect->Set(Nan::New<String>("height").ToLocalChecked(),
          Nan::New<Number>(mRegions[i].rect.height));
      prediction->Set(Nan::New<String>("rect").ToLocalChecked(), rect);

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
  cv::Mat mat;
  string mClassName;
  vector<cv::Rect> mMotionRects;
  int mMinSize;
  int mMaxMergingIterations;
  float mNmsThreshold;
  float mConfThreshold;

  vector<CvRectScore> mRegions;
};

/**
 * Return top prediction for all the regions with in the input image. This
 * function first computes the regions with in an image and then
 * run prediction on each one of them. It then runs non-maximal suppression
 * on the predicted results before returning the predicted regions.
 * This function could be used to classify multiple objects with in an image.
 */
NAN_METHOD(Model::Rcnn) {
  SETUP_FUNCTION(Model)

  if (info.Length() < 4) {
    JSTHROW("Image matrix, class name, motion rectangles and callback function must be provided");
  }

  cv::Mat mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(
      info[0]->ToObject())->mat;

  string className;
  STRING_FROM_ARGS(className, 1);

  // Motion rectangles
  if (!info[2]->IsArray()) {
    JSTHROW_TYPE("Argument #3 is not an array");
  }

  vector<cv::Rect> motionRects;
  Handle<Array> jsArray = Handle<Array>::Cast(info[2]);
  for (unsigned int i = 0; i < jsArray->Length(); i++) {
    Handle<Value> val = jsArray->Get(i);
    v8::Local<v8::Object> rect = v8::Local<v8::Object>::Cast(val);
    cv::Rect motionRect(
      rect->Get(Nan::New<v8::String>("x").ToLocalChecked())->IntegerValue(),
      rect->Get(Nan::New<v8::String>("y").ToLocalChecked())->IntegerValue(),
      rect->Get(Nan::New<v8::String>("width").ToLocalChecked())->IntegerValue(),
      rect->Get(Nan::New<v8::String>("height").ToLocalChecked())->IntegerValue()
    );
    motionRects.push_back(motionRect);
  }

  REQ_FUN_ARG(3, cb);

  // Minimum size of the selective search regions
  int minSize = 100;
  if (info.Length() >= 5) {
    INT_FROM_ARGS(minSize, 4);
  }

  // Rounds of neighboring blob merging for selective search regions
  int maxMergingIterations = 1;
  if (info.Length() >= 6) {
    INT_FROM_ARGS(maxMergingIterations, 5);
  }

  // NMS threshold (area of intersection greater than this value will be ignore
  // in favor of rectangle with higher score)
  float nmsThreshold = 0.3f;
  if (info.Length() >= 7) {
    FLOAT_FROM_ARGS(nmsThreshold, 6);
  }

  // Confidence threshold
  float confThreshold = 0.90f;
  if (info.Length() >= 8) {
    FLOAT_FROM_ARGS(confThreshold, 7);
  }

  Nan::Callback *callback = new Nan::Callback(cb.As<Function>());
  Nan::AsyncQueueWorker(new RcnnAsyncWorker(callback, self, mat,
      className, motionRects, minSize, maxMergingIterations, nmsThreshold,
      confThreshold));
}

/**
 * Return the top K predictions
 */
vector<Prediction> Model::Classify(const cv::Mat& img, int topK) {
  vector<float> output = Predict(img);

  vector<int> maxK = Argmax(output, topK);
  vector<Prediction> predictions;
  for (int i = 0; i < topK; ++i) {
    int idx = maxK[i];
    predictions.push_back(make_pair(mLabels[idx], output[idx]));
  }

  return predictions;
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

  // Copy the output layer to a vector
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
void Model::WrapInputLayer(vector<cv::Mat>* inputChannels) {
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
    vector<cv::Mat>* inputChannels) {
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

