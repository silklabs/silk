/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

/********* Object display related constants */
// Time in milliseconds between successive attempts to classify objects in
// preview stream based on the time it generally takes on the device to classify
// a preview image
export const OBJECT_DETECT_INTERVAL = 1000;

// Flag to turn on/off the smoother functionality
export const RUN_SMOOTHER = true;

// Duration of each object. If smoother is used then we extrapolate detected
// objects on every preview frame so this should be the time between each preview
// frame
const PREVIEW_FRAME_MS = 200; // 4 FPS - 50ms to make sure the previous box is gone
export const OBJECT_DURATION = (RUN_SMOOTHER ? PREVIEW_FRAME_MS : OBJECT_DETECT_INTERVAL);

/********* Yolo classification related constants */
export const NUM_SIDES = 7;
export const PROB_THRESH = 0.2;
export const NMS_IOU_THRESH = 0.35;
export const NMS_IOA_THRESH = 0.75;

export const YOLO_LABELS = [
  'aeroplane',
  'bicycle',
  'bird',
  'boat',
  'bottle',
  'bus',
  'car',
  'cat',
  'chair',
  'cow',
  'diningtable',
  'dog',
  'horse',
  'motorbike',
  'person',
  'pottedplant',
  'sheep',
  'sofa',
  'train',
  'tvmonitor',
];

/********* Smoother related constants */
// Wait for this long before declaring that the object is gone
export const MS_MISSING_TILL_LOST = OBJECT_DETECT_INTERVAL * 2;

export const MS_NEW_TILL_VISIBLE = 150;
export const MS_MAX_EXTRAPOLATE = 2000;
export const IOU_THRESH = .5;
export const IOA_THRESH = .75;
