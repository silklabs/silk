/**
 * CppMT/CMT tracker
 *
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#ifndef TRACKERCMT_HPP
#define TRACKERCMT_HPP

#include <opencv2/opencv.hpp>
#if CV_MAJOR_VERSION >= 3
#include <opencv2/imgproc.hpp>
#endif
#include "TrackerBase.h"
#include "CppMT/CMT.h"

class CmtTracker : public TrackerBase {
public:
  CmtTracker(double minConfidence)
    : TrackerBase(minConfidence),
      drawPoints(false) {}

private:
  cmt::CMT cmt;
  bool drawPoints;

  virtual bool initImpl(const cv::Mat& image,
                        const cv::Rect& boundingBox,
                        double& defaultConfidence) {
    defaultConfidence = 0.2;
    cmt.consensus.estimate_rotation = true;
    cmt.initialize(image, boundingBox);
    return true;
  }

  virtual double updateImpl(const cv::Mat& image, cv::Rect& boundingBox) {
    cmt.processFrame(image);

#if CV_MAJOR_VERSION >= 3
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
#endif
    boundingBox = cmt.bb_rot.boundingRect();
    return cmt.confidence;
  }
};

#endif
