/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

/********* Face detector related constants */
// Time in milliseconds between successive attempts to locate a face in the
// preview stream.
export const FACE_DETECT_INTERVAL = 1000;

// Number of times to wait for a successfull identification
export const WAIT_FOR_RECOGNITION_ATTEMPTS = 1;

/********* Tracker related constants */
//export const TRACKER_NAME = 'CMT';
export const TRACKER_NAME = 'DLIB';

// Set a reasonable limit of tracked objects
// (3 for device as CMT has not yet been optimized for tracking multiple
// objects, see #676)
export const MAX_TRACKED_OBJECTS = process.platform === 'android' ? 3 : 10;

// If a face (strong or weak) is not associated with a tracker in this many
// calls to detectedFaces(), cancel the tracker
export const MAX_NO_FACE_SEEN = 3;

// Keep the faces around for this long before declaring them as lost to account
// for a face that may reappear after a brief occlusion
export const FACE_DURATION = 5000;


/********* Recognizer related constants */
// Once a face has been recognized, run the face recognizer this often to
// as a sanity check to confirm the expected face is still being tracked
export const RECOGNIZED_FACE_CHECK_INTERVAL = 3000;

// Once a face has been recognized, this is the max number of incorrect
// recognitions over the last `INCONSISTENT_FACE_PREDICTION_WINDOW` predictions
// before dropping the face from active tracking.
export const MAX_INCONSISTENT_FACE_PREDICTION = 2;

// Number of past predictions to maintain to monitor incorrect predictions over
export const INCONSISTENT_FACE_PREDICTION_WINDOW = 5;

// Capture up to this many training images for an unknown face
export const MAX_UNKNOWN_FACE_TRAINING_IMAGES = 100;

// Minimum number of images that must be collected before an unknown face will
// be trained.
export const MIN_IMAGES_FOR_TRAINING = 10;


/********* Face movement related constants */
export const MOVEMENT_CHANGE_THRESHOLD = 50;
export const FACE_AVERAGE_DURATION = 2000;

