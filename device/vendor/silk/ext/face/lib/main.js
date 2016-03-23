/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

// Load the regnerator polyfill manually so we don't need to also load all the
// core-js polyfills which we don't actually need...
import regeneratorRuntime from 'babel-runtime/regenerator';
global.regeneratorRuntime = global.regeneratorRuntime || regeneratorRuntime;

import FaceDetector from './face_detector';
import FaceRecognizer from './face_recognizer';
import FaceTracker from './face_tracker';

// Time in milliseconds between successive attempts to locate a face in the
// preview stream.
const FACE_DETECT_INTERVAL = 1000;

let camera;
let log;
let sysutils;
let timeline;

class Main {
  lastFaceDetect: number = 0;
  processingMotion: bool = false;

  constructor(env) {
    camera = env.camera;
    log = env.log;
    sysutils = env.util;
    timeline = env.timeline;

    timeline.on('preview', this.onPreview);
    timeline.on('motion', this.onMotion);
    timeline.on('no-motion', this.onNoMotion);
    sysutils.propWatcher.on('silk.addperson', this.onPropAddPerson);

    this.faceDetector = new FaceDetector(env);
    this.faceTracker = new FaceTracker(env, 'low');
    this.faceRecognizer = new FaceRecognizer(env);
  }

  willUnload(): void {
    sysutils.propWatcher.removeListener('silk.addperson', this.onPropAddPerson);
    timeline.removeListener('no-motion', this.onNoMotion);
    timeline.removeListener('motion', this.onMotion);
    timeline.removeListener('preview', this.onPreview);
  }

  async detectFaces(when: number): Promise<void> {
    const now = Date.now();
    if (Math.abs(this.lastFaceDetect - now) < FACE_DETECT_INTERVAL) {
      return;
    }

    if (this.processingMotion) {
      log.debug(`onMotion busy, skipping update`);
      return;
    }
    this.processingMotion = true;
    this.lastFaceDetect = now;

    // Fetch the current frame in all the different required formats at once
    let [lowgray, gray, grayeq, highgray, fullgray] = await camera.getFrame(
      when,
      ['lowgray', 'gray', 'grayeq', 'highgray', 'fullgray']
    );

    // Look for faces in the scene
    const [faceRects, weakFaceRects] =
      await this.faceDetector.detect(when, highgray, 'high', grayeq, fullgray);

    // Inform the tracker about the observed faces
    this.faceTracker.detectedFaces(when, faceRects, weakFaceRects, lowgray);

    // Run face recognizer on the tracked faces
    await this.faceRecognizer.predict(when, this.faceTracker.faces, gray, fullgray);

    this.processingMotion = false;
  }

  onMotion = (when: number): void => {
    this.detectFaces(when);
  }

  onNoMotion = (when: number): void => {
    // If a face is being tracked, continue to try to detect faces even if
    // there's no motion.  This is to help ensure that the trackers continue to
    // be actually tracking faces.
    if (this.faceTracker.faces.length > 0) {
      this.detectFaces(when);
    }
  }

  onPreview = async (when: number): Promise<void> => {
    let [lowgray] = await camera.getFrame(when, ['lowgray']);
    await this.faceTracker.update(when, lowgray);

    // Update timeline with currently tracked faces
    this.faceTracker.faces.forEach(face => {
      const name = this.faceRecognizer.faceLabel(face.faceId) || 'unknown face';
      log.debug(`'face' (${name}) added to timeline at`, face.rectWhen);
      timeline.addObjects(
        [{
          id: face.id,
          tag: 'face',
          when: face.rectWhen,
          rects: [face.rect],
          source: 'face',
          durationMs: FACE_DETECT_INTERVAL,
          name,
          faceId: face.faceId,
        }]
      );
      face.name = name; // Add name to the face object
    });
  };

  onCommand(cmd) {
    switch (cmd.msg) {
    case 'addPerson':
      this.faceRecognizer.addPerson(cmd.person);
      break;
    default:
      log.verbose('Unknown command:', cmd);
      break;
    }
  }

  onPropAddPerson = () => {
    const person = sysutils.getprop('silk.addperson');
    this.faceRecognizer.addPerson(person);
  }
}

module.exports = (env) => {
  return new Main(env);
};
