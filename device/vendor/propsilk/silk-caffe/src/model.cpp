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
#include <chrono>
#include <cblas.h>

#if CV_MAJOR_VERSION >= 3
#include <opencv2/imgproc.hpp>
#endif

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
  Nan::SetPrototypeMethod(ctor, "setLabels", SetLabels);
  Nan::SetPrototypeMethod(ctor, "predictTopK", PredictTopK);
  Nan::SetPrototypeMethod(ctor, "rcnn", Rcnn);
  Nan::SetPrototypeMethod(ctor, "nms", NonMaximaSuppression);
  Nan::SetPrototypeMethod(ctor, "time", Time);

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
  meanAvailable(false) {
}

/**
 *
 */
Model::~Model() {
  caffeNet.reset();
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

    model->caffeNet.reset(new Net<float>(modelPath, caffe::TEST));
    model->caffeNet->CopyTrainedLayersFrom(weightsPath);

    if (model->caffeNet->num_inputs() != 1) {
      SetErrorMessage("Network should have exactly one input");
      return;
    }

    if (model->caffeNet->num_outputs() != 1) {
      SetErrorMessage("Network should have exactly one output");
      return;
    }

    Blob<float> *inputLayer = model->caffeNet->input_blobs()[0];
    model->numChannels = inputLayer->channels();
    if ((model->numChannels != 3) && (model->numChannels != 1)) {
      SetErrorMessage("Input layer should have 1 or 3 channels");
      return;
    }

    model->inputGeometry = cv::Size(inputLayer->width(), inputLayer->height());
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
  if (meanBlob.channels() != self->numChannels) {
    JSTHROW("Number of channels of mean file doesn't match input layer");
  }

  // The format of the mean file is planar 32-bit float BGR or grayscale
  vector<cv::Mat> channels;
  float *data = meanBlob.mutable_cpu_data();
  for (int i = 0; i < self->numChannels; ++i) {
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
  self->mean = cv::Mat(self->inputGeometry, mean.type(), channelMean);
  self->meanAvailable = true;
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
    self->labels.push_back(line);
  }

  Blob<float>* outputLayer = self->caffeNet->output_blobs()[0];
  if (self->labels.size() != outputLayer->channels()) {
    ALOGD("Labels size: %lu channels: %d", self->labels.size(),
        outputLayer->channels());
    JSTHROW("Number of labels is different from the output layer dimension");
  }
}

/**
 * Async wrapper for predictTopK API
 */
template <class T>
class PredictAsyncWorker: public Nan::AsyncWorker {
public:
  PredictAsyncWorker(Nan::Callback *callback, Model* model, T mat,
      int topK):
    Nan::AsyncWorker(callback),
    model(model),
    mat(mat),
    topK(topK) {
  }

  void Execute() {
    topK = min<int>(model->labels.size(), topK);
    predictions = model->Classify(mat, topK);
  }

  void HandleOKCallback() {
    Local<Array> result = Nan::New<Array>(topK);
    for (int i = 0; i < predictions.size(); ++i) {
      Local<Object> prediction = Nan::New<Object>();
      prediction->Set(Nan::New<String>("label").ToLocalChecked(),
          Nan::New<String>(predictions[i].first).ToLocalChecked());
      prediction->Set(Nan::New<String>("confidence").ToLocalChecked(),
          Nan::New<Number>(predictions[i].second));
      result->Set(i, prediction);
    }

    Local<Value> argv[2];
    argv[0] = Nan::Null();
    argv[1] = result;

    Nan::TryCatch try_catch;
    callback->Call(2, argv);
    if (try_catch.HasCaught()) {
      Nan::FatalException(try_catch);
    }
  }

private:
  Model* model;
  T mat;
  int topK;
  vector<Prediction> predictions;
};

/**
 * Return the top K predictions for the provided image asynchronously
 */
NAN_METHOD(Model::PredictTopK) {
  SETUP_FUNCTION(Model)

  if (info.Length() < 3) {
    JSTHROW("Image matrix, topK and callback function must be provided");
  }

  int topK = 0;
  INT_FROM_ARGS(topK, 1);

  REQ_FUN_ARG(2, cb);

  Nan::Callback *callback = new Nan::Callback(cb.As<Function>());

  if (info[0]->IsArray()) {
    vector<vector<float>> array;
    Handle<Array> rows = Handle<Array>::Cast(info[0]);
    for (int h = 0; h < rows->Length(); ++h) {
      Handle<Array> cols = Handle<Array>::Cast(rows->Get(h));
      vector<float> column;
      for (int w = 0; w < cols->Length(); ++w) {
        float val = cols->Get(w)->NumberValue();
        column.push_back(val);
      }
      array.push_back(column);
    }
    Nan::AsyncQueueWorker(new PredictAsyncWorker<vector<vector<float>>>(callback,
        self, array, topK));
  } else {
    cv::Mat mat = Nan::ObjectWrap::Unwrap<node_opencv::Matrix>(
        info[0]->ToObject())->mat;
    Nan::AsyncQueueWorker(new PredictAsyncWorker<cv::Mat>(callback, self, mat, topK));
  }
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
    className(className),
    motionRects(motionRects),
    minSize(minSize),
    maxMergingIterations(maxMergingIterations),
    nmsThreshold(nmsThreshold),
    confThreshold(confThreshold) {
  }

  void Execute() {
    chrono::time_point<chrono::system_clock> start, end;
    chrono::duration<double> elapsed_seconds;

    // Run selective search to get all the regions of the image and run
    // prediction on each of the regions
    start = chrono::system_clock::now();
    dlib::matrix_range_exp<double> kvals = dlib::linspace(50, 200, 3);
    vector<cv::Rect> proposedRects = getObjectProposals(mat, kvals, minSize,
        maxMergingIterations);
    end = chrono::system_clock::now();
    elapsed_seconds = end - start;
    ALOGD("# object proposals: %lu in %f secs", proposedRects.size(),
          elapsed_seconds.count());

    // Only keep the proposed rectangles that intersect with motion rectangles
    start = chrono::system_clock::now();
    vector<cv::Rect> rects = boxIntersect(proposedRects, motionRects);
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
      if (prediction[0].first == className) {
        CvRectScore rectScore = {prediction[0].second, regionRect};
        // Only return the predictions with confidence higher than mConfThreshold
        if (prediction[0].second >= confThreshold) {
          predictions.push_back(rectScore);
          ALOGV("Prediction for region# %d %s score: %f rect: [%d, %d, %d, %d]",
              count, prediction[0].first.c_str(), prediction[0].second,
              regionRect.x, regionRect.y, regionRect.width, regionRect.height);
        }
      }
    }

    if (predictions.size() > 0) {
      start = chrono::system_clock::now();
      mRegions = NMS(predictions, nmsThreshold);
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
    Local<Array> result = Nan::New<Array>(mRegions.size());
    for (int i = 0; i < mRegions.size(); ++i) {
      Local<Object> prediction = Nan::New<Object>();
      prediction->Set(Nan::New<String>("label").ToLocalChecked(),
          Nan::New<String>(className).ToLocalChecked());
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

      result->Set(i, prediction);
    }

    Local<Value> argv[2];
    argv[0] = Nan::Null();
    argv[1] = result;

    Nan::TryCatch try_catch;
    callback->Call(2, argv);
    if (try_catch.HasCaught()) {
      Nan::FatalException(try_catch);
    }
  }

private:
  Model* model;
  cv::Mat mat;
  string className;
  vector<cv::Rect> motionRects;
  int minSize;
  int maxMergingIterations;
  float nmsThreshold;
  float confThreshold;

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
 * Return the top K predictions on a cv::Mat
 */
vector<Prediction> Model::Classify(const cv::Mat& img, int topK) {
  cv::Mat newImg = Preprocess(img);

  // Convert opencv matrix to Blob
  std::unique_ptr<Blob<float>> blob(new Blob<float>(1, newImg.channels(), newImg.rows,
      newImg.cols));
  cvMatToBlob(newImg, blob.get());

  return Predict(blob.get(), topK);
}

/**
 * Return the top K predictions on array representing a 2D array
 */
vector<Prediction> Model::Classify(vector<vector<float>> &array, int topK) {
  int numRows = array.size();
  int numColumns = array[0].size();

  // Convert vector to Blob
  std::unique_ptr<Blob<float>> blob(new Blob<float>(1, 1, numRows, numColumns));
  arrayToBlob(array, blob.get());

  return Predict(blob.get(), topK);
}

/**
 * Runs forward pass for the whole network
 */
template<typename Dtype>
vector<Prediction> Model::Predict(Blob<Dtype>* blob, int topK) {
  // Fill the bottom vector
  vector<Blob<float>*> bottom;
  bottom.push_back(blob);
  float type = 0.0;

  chrono::time_point<chrono::system_clock> startTime = chrono::system_clock::now();
  caffeNet->Forward(bottom, &type);
  chrono::time_point<chrono::system_clock> endTime = chrono::system_clock::now();
  chrono::duration<double> elapsedSeconds = endTime - startTime;
  ALOGD("Forward finished in %.2f ms", elapsedSeconds.count() * 1000);

  // Copy the output layer to a vector
  Blob<float>* output_layer = caffeNet->output_blobs()[0];
  const float* begin = output_layer->cpu_data();
  const float* end = begin + output_layer->channels();
  vector<float> output  = vector<float>(begin, end);

  vector<int> maxK = Argmax(output, topK);
  vector<Prediction> predictions;
  for (int i = 0; i < topK; ++i) {
    int idx = maxK[i];
    predictions.push_back(make_pair(labels[idx], output[idx]));
  }

  return predictions;
}

/**
 *
 */
cv::Mat Model::Preprocess(const cv::Mat& img) {
  // Convert the input image to the input image format of the network
  cv::Mat sample;
  if (img.channels() == 3 && numChannels == 1) {
    cv::cvtColor(img, sample, cv::COLOR_BGR2GRAY);
  } else if (img.channels() == 4 && numChannels == 1) {
    cv::cvtColor(img, sample, cv::COLOR_BGRA2GRAY);
  } else if (img.channels() == 4 && numChannels == 3) {
    cv::cvtColor(img, sample, cv::COLOR_BGRA2BGR);
  } else if (img.channels() == 1 && numChannels == 3) {
    cv::cvtColor(img, sample, cv::COLOR_GRAY2BGR);
  } else {
    sample = img;
  }

  cv::Mat sampleResized;
  if (sample.size() != inputGeometry) {
    cv::resize(sample, sampleResized, inputGeometry);
  } else {
    sampleResized = sample;
  }

  cv::Mat sampleFloat;
  if (numChannels == 3) {
    sampleResized.convertTo(sampleFloat, CV_32FC3);
  } else {
    sampleResized.convertTo(sampleFloat, CV_32FC1);
  }

  if (meanAvailable) {
    cv::Mat sampleNormalized;
    cv::subtract(sampleFloat, mean, sampleNormalized);
    return sampleNormalized;
  } else {
    return sampleFloat;
  }
}

/**
 * Convert opencv matrix to Blob type
 */
template<typename Dtype>
void Model::cvMatToBlob(const cv::Mat& image, Blob<Dtype>* blob) {
  if (!image.data) {
    JSTHROW("Image data must not be NULL");
  }
  if (image.rows <= 0) {
    JSTHROW("Image height must be positive");
  }
  if (image.cols <= 0) {
    JSTHROW("Image width must be positive");
  }

  const int numChannels = image.channels();
  Dtype* data = blob->mutable_cpu_data();

  for (int c = 0; c < numChannels; ++c) {
    for (int h = 0; h < image.rows; ++h) {
      for (int w = 0; w < image.cols; ++w) {
        data[blob->offset(0, c, h, w)] = static_cast<Dtype>(image.at<cv::Vec3f> (h, w)[c]);
      }
    }
  }
}

template<typename Dtype> void Model::arrayToBlob(vector<vector<float>> &array,
    Blob<Dtype>* blob) {
  const int numChannels = 1;
  float* data = blob->mutable_cpu_data();

  for (int c = 0; c < numChannels; ++c) {
    for (int h = 0; h < array.size(); ++h) {
      for (int w = 0; w < array[h].size(); ++w) {
        data[blob->offset(0, c, h, w)] = array[h][w];
      }
    }
  }
}

/**
 *
 */
NAN_METHOD(Model::NonMaximaSuppression) {
  if (info.Length() < 1) {
    JSTHROW("Boxes to run NMS on must be provided");
  }

  // Motion rectangles
  if (!info[0]->IsArray()) {
    JSTHROW_TYPE("Argument #1 is not an array");
  }

  vector<CvRectScore> boxesOrig;
  Handle<Array> jsArray = Handle<Array>::Cast(info[0]);
  for (unsigned int i = 0; i < jsArray->Length(); i++) {
    Handle<Value> val = jsArray->Get(i);
    v8::Local<v8::Object> rectObj = v8::Local<v8::Object>::Cast(val);
    float score = rectObj->Get(Nan::New<v8::String>("score").ToLocalChecked())->NumberValue();
    cv::Rect rect(
        rectObj->Get(Nan::New<v8::String>("x").ToLocalChecked())->IntegerValue(),
        rectObj->Get(Nan::New<v8::String>("y").ToLocalChecked())->IntegerValue(),
        rectObj->Get(Nan::New<v8::String>("width").ToLocalChecked())->IntegerValue(),
        rectObj->Get(Nan::New<v8::String>("height").ToLocalChecked())->IntegerValue()
    );
    CvRectScore rectScore = {score, rect};
    boxesOrig.push_back(rectScore);
  }

  // NMS threshold (area of intersection greater than this value will be ignore
  // in favor of rectangle with higher score)
  float nmsThreshold = 0.3f;
  if (info.Length() >= 2) {
    FLOAT_FROM_ARGS(nmsThreshold, 1);
  }

  vector<CvRectScore> regions = NMS(boxesOrig, nmsThreshold);

  // Send the result back to JS
  Local<Array> predictions = Nan::New<Array>(regions.size());
  for (int i = 0; i < regions.size(); ++i) {
    Local<Object> rect = Nan::New<Object>();
    rect->Set(Nan::New<String>("score").ToLocalChecked(),
        Nan::New<Number>(regions[i].score));
    rect->Set(Nan::New<String>("x").ToLocalChecked(),
        Nan::New<Number>(regions[i].rect.x));
    rect->Set(Nan::New<String>("y").ToLocalChecked(),
        Nan::New<Number>(regions[i].rect.y));
    rect->Set(Nan::New<String>("width").ToLocalChecked(),
        Nan::New<Number>(regions[i].rect.width));
    rect->Set(Nan::New<String>("height").ToLocalChecked(),
        Nan::New<Number>(regions[i].rect.height));
    predictions->Set(i, rect);
  }
  info.GetReturnValue().Set(predictions);
}

/**
 * Benchmark model execution time
 */
NAN_METHOD(Model::Time) {
  SETUP_FUNCTION(Model)

  if (info.Length() < 1) {
    JSTHROW("Invalid number of arguments provided");
  }

  string model;
  STRING_FROM_ARGS(model, 0);

  int iterations = 50;
  if (info.Length() >= 2) {
    INT_FROM_ARGS(iterations, 1);
  }

  int numThreads = -1;
  if (info.Length() >= 3) {
    INT_FROM_ARGS(numThreads, 2);
  }
#ifdef ANDROID
  if (numThreads != -1) {
    ALOGD("Setting threads count %d", numThreads);
    openblas_set_num_threads(numThreads);
  }
  ALOGD("openblas using threads: %d num_procs: %d", openblas_get_num_threads(),
        openblas_get_num_procs());
#endif

  ALOGD("Use CPU");
  Caffe::set_mode(Caffe::CPU);

  // Instantiate caffe net
  Net<float> caffeNet(model, caffe::TRAIN);

  // Do a clean forward and backward pass, so that memory allocation are done
  // and future iterations will be more stable.
  ALOGD("Performing Forward");

  // Note that for the speed benchmark, we will assume that the network does
  // not take any input blobs.
  float initial_loss;
  caffeNet.Forward(&initial_loss);
  ALOGD("Initial loss: %f", initial_loss);
  ALOGD("Performing Backward");
  caffeNet.Backward();

  const vector<boost::shared_ptr<Layer<float> > >& layers = caffeNet.layers();
  const vector<vector<Blob<float>*> >& bottom_vecs = caffeNet.bottom_vecs();
  const vector<vector<Blob<float>*> >& top_vecs = caffeNet.top_vecs();
  const vector<vector<bool> >& bottom_need_backward =
      caffeNet.bottom_need_backward();

  ALOGD("*** Benchmark begins ***");
  ALOGD("Testing for %d iterations", iterations);
  Timer total_timer;
  total_timer.Start();
  Timer forward_timer;
  Timer backward_timer;
  Timer timer;
  std::vector<double> forward_time_per_layer(layers.size(), 0.0);
  std::vector<double> backward_time_per_layer(layers.size(), 0.0);
  double forward_time = 0.0;
  double backward_time = 0.0;
  for (int j = 0; j < iterations; ++j) {
    Timer iter_timer;
    iter_timer.Start();
    forward_timer.Start();
    for (int i = 0; i < layers.size(); ++i) {
      timer.Start();
      layers[i]->Forward(bottom_vecs[i], top_vecs[i]);
      forward_time_per_layer[i] += timer.MicroSeconds();
    }
    forward_time += forward_timer.MicroSeconds();
    backward_timer.Start();
    for (int i = layers.size() - 1; i >= 0; --i) {
      timer.Start();
      layers[i]->Backward(top_vecs[i], bottom_need_backward[i],
                          bottom_vecs[i]);
      backward_time_per_layer[i] += timer.MicroSeconds();
    }
    backward_time += backward_timer.MicroSeconds();
    ALOGD("Iteration: %d forward-backward time: %.2f ms", j + 1,
          iter_timer.MilliSeconds());
  }
  ALOGD("Average time per layer: ");
  for (int i = 0; i < layers.size(); ++i) {
    ALOGD("Layer[%d] \tforward: %f ms", i,
          (forward_time_per_layer[i] / 1000 / iterations));
    ALOGD("Layer[%d] \tbackward: %f ms", i,
          (backward_time_per_layer[i] / 1000 / iterations));
  }
  total_timer.Stop();
  ALOGD("*** Benchmark ends ***");

  Local<Object> result = Nan::New<Object>();
  result->Set(Nan::New<String>("forward").ToLocalChecked(),
      Nan::New<Number>(forward_time / 1000 / iterations));
  result->Set(Nan::New<String>("backward").ToLocalChecked(),
      Nan::New<Number>(backward_time / 1000 / iterations));
  result->Set(Nan::New<String>("forwardbackward").ToLocalChecked(),
      Nan::New<Number>(total_timer.MilliSeconds() / iterations));
  result->Set(Nan::New<String>("total").ToLocalChecked(),
      Nan::New<Number>(total_timer.MilliSeconds()));
  info.GetReturnValue().Set(result);
}
