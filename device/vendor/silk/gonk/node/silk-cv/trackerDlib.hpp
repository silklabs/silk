/**
 * cv::Tracker wrapper around dlib::correlation_tracker
 *
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#include <opencv2/opencv.hpp>

#if CV_MAJOR_VERSION >= 3
#include <opencv2/tracking.hpp>
#undef sign // How rude!  opencv2/tracking/onlineMIL.hpp defines `sign`
#include <dlib/image_processing.h>
#include <dlib/opencv/cv_image.h>

class DlibTracker : public virtual cv::Tracker {
public:
  DlibTracker() {
    minConfidence = 5; // TODO: Make configurable
    isInit = false;
  }
  void read(const cv::FileNode& fn) {}
  void write(cv::FileStorage& fs) const {}
private:
  dlib::correlation_tracker tracker;
  float minConfidence;

  class DlibTrackerModel : public virtual cv::TrackerModel {
    // Stub class to make cv::Tracker happy
    virtual void modelEstimationImpl(const std::vector<cv::Mat>& responses) {}
    virtual void modelUpdateImpl() {}
  };

  virtual bool initImpl(const cv::Mat& image, const cv::Rect2d& boundingBox) {
    this->model = new DlibTrackerModel();
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

  virtual bool updateImpl(const cv::Mat& image, cv::Rect2d& boundingBox) {
    double confidence = tracker.update(dlib::cv_image<unsigned char>(image));

    const dlib::drectangle rect(tracker.get_position());
    boundingBox.x = rect.left();
    boundingBox.y = rect.top();
    boundingBox.width = rect.width();
    boundingBox.height = rect.height();

    return confidence > minConfidence;
  }
};

#endif
