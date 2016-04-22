/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#include "cvutils.h"

std::vector<CvRectScore> NMS(std::vector<CvRectScore> boxesOrig,
    float overlap) {
  int i;
  CvRectScore *boxes = &boxesOrig.front();
  std::vector<CvRectScore> resRects;

  int num = boxesOrig.size();
  while (num) {
    // Greedily select the highest scoring bounding box
    int best = -1;
    float bestS = std::numeric_limits<float>::min();
    for (i = 0; i < num; i++) {
      if (boxes[i].score > bestS) {
        bestS = boxes[i].score;
        best = i;
      }
    }
    resRects.push_back(boxes[best]);
    cv::Rect b = boxes[best].rect;
    CvRectScore tmp = boxes[0];
    boxes[0] = boxes[best];
    boxes[best] = tmp;
    boxes++;

    float A1 = b.width * b.height, A2, inter, inter_over_union;

    // Remove all bounding boxes where the percent area of overlap is greater
    // than overlap threshold
    int numGood = 0;
    for (i = 0; i < num - 1; i++) {
      A2 = boxes[i].rect.width * boxes[i].rect.height;
      inter = (b & boxes[i].rect).area();
      inter_over_union = inter / (A1 + A2 - inter);

      // If two boxes are within each other or the area of intersection is less
      // than overlap threshold then keep this box
      if ((inter != A2) && (inter != A1) && (inter_over_union <= overlap)) {
        CvRectScore tmp = boxes[numGood];
        boxes[numGood++] = boxes[i];
        boxes[i] = tmp;
      }
    }
    num = numGood;
  }
  return resRects;
}

cv::Rect dlibRectToOpenCVRect(dlib::rectangle dlibrect) {
  return cv::Rect(dlibrect.left(), dlibrect.top(), dlibrect.width(),
                  dlibrect.height());
}

vector<cv::Rect> getObjectProposals(const cv::Mat& inputImage,
    const dlib::matrix_range_exp<double>& kvals, const unsigned long minSize,
    const unsigned long maxMergingIterations) {
  dlib::cv_image <dlib::rgb_pixel> image(inputImage);

  // Find candidate objects
  vector<dlib::rectangle> rects;
  dlib::find_candidate_object_locations(image, rects, kvals, minSize,
      maxMergingIterations);

  // Convert dlib rectangle to opencv rectangle
  vector<cv::Rect> opencvRects;
  for (int count = 0; count < rects.size(); count++) {
    dlib::rectangle dlibrect = rects[count];
    opencvRects.push_back(dlibRectToOpenCVRect(dlibrect));
  }

  return opencvRects;
}

vector<cv::Rect> boxIntersect(vector<cv::Rect> proposedRects,
    vector<cv::Rect> motionRects) {
  // If no motion rectangles provided then run RCNN on all the proposed
  // rectangles
  if (motionRects.size() == 0) {
    return proposedRects;
  }

  vector<cv::Rect> keep;
  for (int i = 0; i < proposedRects.size(); i++) {
    for (int j = 0; j < motionRects.size(); j++) {
      // Check if a proposed rect intersect with any of the motion rect
      if ((proposedRects[i] & motionRects[j]).area() > 0) {
        keep.push_back(proposedRects[i]);
        break;
      }
    }
  }

  return keep;
}
