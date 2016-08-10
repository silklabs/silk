#!/usr/bin/env ../../../../../pub/babel-run/babel-node

/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import Env from 'silk-exttest';
import path from 'path';
import fs from 'fs';
import eventToPromise from 'event-to-promise';

import FaceDetector from '../lib/face_detector';
import {Face} from '../lib/face';

const env = new Env('silk-face');
const camera = env.camera;

const HAAR = '../../../../../../sim/system/silk/media/opencv/haarcascade_frontalface_alt2.xml';
const DLIB_LANDMARK = '../../../../../../external-dlib/shape_predictor_68_face_landmarks.dat';

/**
 * Run prediction on the specified image and return the detected face rectangles
 */
async function detectFaces(fileName) {
  const faceDetector = new FaceDetector(env, path.resolve(__dirname, HAAR),
      path.resolve(__dirname, DLIB_LANDMARK));
  await eventToPromise(faceDetector, 'ready');

  console.log(`Reading image ${fileName}`);
  if (!fs.existsSync(fileName)) {
    throw new Error(`${fileName} doesn't exit`);
  }
  let when = Date.now();
  await camera.setPreviewFrame(when, fileName);

  // Fetch the current frame in all the different required formats at once
  let [grayeq, highgray, fullgray] = await camera.getFrame(when,
      ['grayeq', 'highgray', 'fullgray']
  );

  let [faceRects] = await faceDetector.detect(when, highgray, 'high', grayeq, fullgray);
  console.log(`Strong faces: ${JSON.stringify(faceRects)}`);

  return faceRects;
}

async function run(clipDirectory) {
  try {
    // Find the face rectangle in the first image to be used for the
    // heart rate estimation
    if (!fs.existsSync(clipDirectory)) {
      throw new Error(`${clipDirectory} does not exist`);
    }
    let previews = fs.readdirSync(clipDirectory);
    let faceRects = await detectFaces(
        path.join(clipDirectory, previews[0]));
    if (!faceRects.length) {
      throw new Error(`No strong face found in ${previews[0]}`);
    }

    // Create a face and set the face rectangle
    let face = new Face(1, env);
    face.setLocation(faceRects[0], Date.now());

    // Start playing the camera previews from the specified clip directory
    camera.startPlayback(clipDirectory, 'fast', () => {
      console.log(`Done analysing heart rate`);
      face.cancel();
    });
  } catch (err) {
    console.error(`Error running hearrate analyzer: ${err.stack || err}`);
  }
}

/*****************************************************************************/
if (process.argv.length < 3) {
  console.log(`Usage:
    clipDirectory: Directory containing the clips to use for estimation`);
  process.exit(1);
}

run(process.argv[2]);

