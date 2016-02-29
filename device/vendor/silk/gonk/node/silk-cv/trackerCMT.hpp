/**
 * cv::Tracker wrapper around the CppMT/CMT class
 *
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#include <opencv2/opencv.hpp>

#if CV_MAJOR_VERSION >= 3

#include <opencv2/tracking.hpp>
#include <opencv2/imgproc.hpp>
#include "CppMT/CMT.h"

class CmtTracker : public virtual cv::Tracker {
public:
  CmtTracker()
    : drawPoints(false), // TODO: Make configurable
      minConfidence(0.3) {
    isInit = false;
  }
  void read(const cv::FileNode& fn) {}
  void write(cv::FileStorage& fs) const {}
private:
  cmt::CMT cmt;
  bool drawPoints;
  float minConfidence;

  class CmtTrackerModel : public virtual cv::TrackerModel {
    // Stub class to make cv::Tracker happy
    virtual void modelEstimationImpl(const std::vector<cv::Mat>& responses) {}
    virtual void modelUpdateImpl() {}
  };

  virtual bool initImpl(const cv::Mat& image, const cv::Rect2d& boundingBox) {
    this->model = new CmtTrackerModel();
    cmt.consensus.estimate_rotation = true;
    cmt.initialize(image, boundingBox);
    return true;
  }

  virtual bool updateImpl(const cv::Mat& image, cv::Rect2d& boundingBox) {
    cmt.processFrame(image);

    if (drawPoints) {
      // Active points
      for (size_t i = 0; i < cmt.points_active.size(); i++) {
        cv::circle(image, cmt.points_active[i], 2, cvScalar(255,0,0));
      }

      // Tracked rectangle
      Point2f vertices[4];
      cmt.bb_rot.points(vertices);
      for (int i = 0; i < 4; i++) {
        cv::line(image, vertices[i], vertices[(i+1) % 4], cvScalar(255,0,0));
      }
    }

    boundingBox = cmt.bb_rot.boundingRect();
    return cmt.confidence > minConfidence;
  }
};

#endif
