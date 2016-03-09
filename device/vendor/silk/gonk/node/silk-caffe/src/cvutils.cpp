/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#include "cvutils.h"

void NMS(std::vector<CvRectScore> boxes_orig,
    std::vector<CvRectScore>& resRects, float overlap) {
  int i;
  int numNMS = 0;
  CvRectScore *boxes = &boxes_orig.front();

  int num = boxes_orig.size();
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
    CvRect b = boxes[best].rect;
    resRects.push_back(boxes[best]);
    boxes++;
    numNMS++;
    float A1 = b.width * b.height, A2, inter, inter_over_union;

    // Remove all bounding boxes where the percent area of overlap is greater
    // than overlap
    int numGood = 0, x1, x2, y1, y2;
    for (i = 0; i < num - 1; i++) {
      x1 = MAX(b.x, boxes[i].rect.x);
      y1 = MAX(b.y, boxes[i].rect.y);
      x2 = MIN(b.x + b.width, boxes[i].rect.x + boxes[i].rect.width);
      y2 = MIN(b.y + b.height, boxes[i].rect.y + boxes[i].rect.height);
      A2 = boxes[i].rect.width * boxes[i].rect.height;
      inter = (float) ((x2 - x1) * (y2 - y1));
      inter_over_union = inter / (A1 + A2 - inter);
      if (inter_over_union <= overlap) {
        CvRectScore tmp = boxes[numGood];
        boxes[numGood++] = boxes[i];
        boxes[i] = tmp;
      }
    }
    num = numGood;
  }
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
