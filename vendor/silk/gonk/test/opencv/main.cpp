/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */
#include <cv.h>
#include <highgui.h>

using namespace cv;

int main( int argc, char** argv )
{
  if( argc != 2) {
    printf("Image file not provided\n");
    return 1;
  }

  Mat image = imread(argv[1], 1);

  char *imageName = argv[1];
  if (!image.data) {
    printf("Unable to read file: %s\n", argv[1]);
    return 1;
  }

  Mat grayImage;
  cvtColor(image, grayImage, CV_BGR2GRAY);

#define write(ext) \
  { \
    printf("Writing /cache/gray." #ext "\n"); \
    imwrite("/cache/gray." #ext, grayImage); \
  }

  write(png);
  write(jpg);
  return 0;
}
