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

// Number of times to wait for a successfull identification
const WAIT_FOR_RECOGNITION_ATTEMPTS = 1;

// Primarily for demoing face training. If enabled, clear trained faces
// after N seconds of not detecting a face.
const FACE_AUTOCLEAR_PROP = 'persist.silk.face.autoclear';
const FACE_AUTOCLEAR_TIMER_SECONDS = 30;

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

    // For demo mode. Kick off autoclear timer to clear faces at init
    this._autoclearEnabled = sysutils.getprop(FACE_AUTOCLEAR_PROP);
    log.info(`face autoclear is ${this._autoclearEnabled ? '' : 'NOT '}enabled`);
    this._resetFaceDetectedTimer();
  }

  willUnload(): void {
    clearTimeout(this._autoclearTimer);
    this._autoclearTimer = null;
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

    if (faceRects.length) {
      this._resetFaceDetectedTimer();
    }

    // Inform the tracker about the observed faces
    this.faceTracker.detectedFaces(when, faceRects, weakFaceRects, lowgray);

    // Run face recognizer on the tracked faces
    if (this.faceTracker.faces.length > 0) {
      await this.faceRecognizer.predict(when, this.faceTracker.faces, gray, fullgray);
    }

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
      // Wait for face to be identified before adding to the timeline
      if ((face.faceId === null) && (face.recognitionCount < WAIT_FOR_RECOGNITION_ATTEMPTS)) {
        log.info(`Waiting for face to be identified ` +
            `(${face.recognitionCount} / ${WAIT_FOR_RECOGNITION_ATTEMPTS})`);
        return;
      }
      const name = this.faceRecognizer.faceLabel(face.faceId) || 'unknown face';
      log.debug(`'face' (id: ${face.id} name: ${name}) added to timeline at`,
          face.rectWhen);
      timeline.addObjects(
        [{
          id: face.id,
          tag: 'face',
          when: face.rectWhen,
          rects: [face.rect],
          source: 'face',
          durationMs: FaceTracker.FACE_DURATION,
          name,
          faceId: face.faceId,
          percentTrained: face.percentTrained,
          movement: face.movement,
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

  _resetFaceDetectedTimer() {
    clearTimeout(this._autoclearTimer);
    this._autoclearTimer = null;
    if (this._autoclearEnabled) {
      this._autoclearTimer = setTimeout(() => this._onAutoclearTimeout(),
        FACE_AUTOCLEAR_TIMER_SECONDS * 1000);
    }
  }

  async _onAutoclearTimeout() {
    log.info(`In autoclear mode, no faces detected for` +
        `${FACE_AUTOCLEAR_TIMER_SECONDS} secs, removing faces`);

    // We'll be mucking with the face training data, so hold off on processing
    // motion, preview events until things settle.

    timeline.removeListener('no-motion', this.onNoMotion);
    timeline.removeListener('motion', this.onMotion);
    timeline.removeListener('preview', this.onPreview);

    await this.faceRecognizer.removeAllPersons();

    timeline.on('preview', this.onPreview);
    timeline.on('motion', this.onMotion);
    timeline.on('no-motion', this.onNoMotion);

    log.info(`Done clearing faces`);
  }
}

module.exports = (env) => {
  return new Main(env);
};
