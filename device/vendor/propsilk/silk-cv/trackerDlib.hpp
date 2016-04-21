/**
 * dlib::correlation_tracker
 *
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */
#ifndef TRACKERDLIB_HPP
#define TRACKERDLIB_HPP
#include <opencv2/opencv.hpp>
#include "TrackerBase.h"
#include <dlib/image_processing.h>
#include <dlib/opencv/cv_image.h>


class DlibTracker : public TrackerBase {
public:
  DlibTracker(double minConfidence): TrackerBase(minConfidence) {}
private:
  dlib::correlation_tracker tracker;

  virtual bool initImpl(const cv::Mat& image,
                        const cv::Rect& boundingBox,
                        double& defaultConfidence) {
    defaultConfidence = 5; // Default minimum confidence picked by observation
    tracker.start_track(
      dlib::cv_image<unsigned char>(image),
      dlib::drectangle(
        boundingBox.x,
        boundingBox.y,
        boundingBox.x + boundingBox.width,
        boundingBox.y + boundingBox.height
      )
    );
    return true;
  }

  virtual double updateImpl(const cv::Mat& image, cv::Rect& boundingBox) {
    double confidence = tracker.update(dlib::cv_image<unsigned char>(image));

    const dlib::drectangle rect(tracker.get_position());
    boundingBox.x = rect.left();
    boundingBox.y = rect.top();
    boundingBox.width = rect.width();
    boundingBox.height = rect.height();

    return confidence;
  }
};

#endif
