/**
 * Tracker base class
 *
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#ifndef TRACKERBASE_H
#define TRACKERBASE_H

#include <opencv2/opencv.hpp>
#include <dlib/image_processing.h>

class TrackerBase {
public:
  TrackerBase(double minConfidence)
    : initialized(false),
      minConfidence(minConfidence) {}
  virtual ~TrackerBase() {}

  bool init(const cv::Mat& image, const cv::Rect& boundingBox) {
    if (initialized || image.empty()) {
      return false;
    }
    double defaultConfidence = 0;
    initialized = initImpl(image, boundingBox, defaultConfidence);
    if (isnan(minConfidence)) {
      minConfidence = defaultConfidence;
    }
    return initialized;
  }

  bool update(const cv::Mat& image, cv::Rect& boundingBox, double *confidence) {
    if (!initialized|| image.empty()) {
      if (confidence != NULL) {
        *confidence = 0;
      }
      return false;
    }
    double updateConfidence = updateImpl(image, boundingBox);
    if (confidence != NULL) {
      *confidence = updateConfidence;
    }
    return updateConfidence > minConfidence;
  }

private:
  bool initialized;
  double minConfidence;
  virtual bool initImpl(const cv::Mat& image, const cv::Rect& boundingBox, double& defaultConfidence) = 0;
  virtual double updateImpl(const cv::Mat& image, cv::Rect& boundingBox) = 0;
};

#endif
