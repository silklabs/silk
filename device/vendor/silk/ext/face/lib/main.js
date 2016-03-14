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
    sysutils.propWatcher.on('silk.addperson', this.onPropAddPerson);

    this.faceDetector = new FaceDetector(env);
    this.faceTracker = new FaceTracker(env);
    this.faceRecognizer = new FaceRecognizer(env);
  }

  willUnload(): void {
    sysutils.propWatcher.removeListener('silk.addperson', this.onPropAddPerson);
    timeline.removeListener('motion', this.onMotion);
    timeline.removeListener('preview', this.onPreview);
  }

  onMotion = async (when: number): Promise<void> => {
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
    let [gray, grayeq, fullgray] = await camera.getPreviewFrames(
      when,
      ['gray', 'grayeq', 'fullgray']
    );

    // Look for faces in the scene
    const [faceRects, weakFaceRects] = await this.faceDetector.detect(when, grayeq, fullgray);

    // Inform the tracker about the observed faces
    this.faceTracker.detectedFaces(when, faceRects, weakFaceRects, grayeq);

    // Run face recognizer on the tracked faces
    await this.faceRecognizer.predict(when, this.faceTracker.faces, gray, fullgray);

    this.processingMotion = false;
  };

  onPreview = async (when: number): Promise<void> => {
    let [grayeq] = await camera.getPreviewFrames(when, ['grayeq']);
    let lostFaces = await this.faceTracker.update(when, grayeq);

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
        }]
      );
    });

    if (lostFaces.length > 0) {
      this.faceRecognizer.updateTraining(lostFaces);
    }
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
