/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

#include <vector>
#include <opencv2/opencv.hpp>
#include <opencv2/core/core.hpp>
#include <opencv2/highgui/highgui.hpp>

#include <dlib/matrix/matrix_utilities.h>
#include <dlib/image_transforms/segment_image.h>
#include <dlib/opencv/cv_image.h>

using namespace std;

/**
 * Stores a bounding box and a detection score
 */
typedef struct {
  float score;  // The detection score
  cv::Rect rect;  // A bounding box
} CvRectScore;

/**
 * Greedy "non-maximal-suppression", where a bounding box with highest score is
 * greedily selected and then invalidate all overlapping boxes.
 *
 * @param boxes An array of num bounding boxes, before non-max suppression.
 *              This array is overwritten by the array of bounding boxes after
 *              non-max suppresison. Should include one bounding box per pixel
 *              location in the correct order when w and h are defined
 * @param resRects Return the bounding boxes after NMS suppression
 * @param overlap Suppress bounding boxes for which the
 *                percent area of overap with a higher scoring bounding box is
 *                greater than this parameter.
 */
void NMS(std::vector<CvRectScore> boxes_orig,
    std::vector<CvRectScore>& resRects, float overlap = 0.3f);
/**
 * Get object proposals based on the input image
 *
 * @param inputImage
 * @param kvals The basic segmentation is performed kvals.size() times, each
 *              time with the k parameter (see the Felzenszwalb paper for
 *              details on k)
 * @param minSize When doing the basic segmentations prior to any box merging,
 *              all rectangles that have an area < min_size are discarded.
 *              Therefore, all outputs and subsequent merged rectangles are
 *              built out of rectangles that contain at least min_size pixels
 * @param maxMergingIterations There are maxMergingIterations rounds of
 *              neighboring blob merging. Therefore, this parameter has some
 *              effect on the number of output rectangles you get, with larger
 *              values of the parameter giving more output rectangles
 */
vector<dlib::rectangle> getObjectProposals(const cv::Mat& inputImage,
    const dlib::matrix_range_exp<double>& kvals, const unsigned long minSize,
    const unsigned long maxMergingIterations);
