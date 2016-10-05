/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import FaceDetector from './face_detector';
import FaceRecognizer from './face_recognizer';
import FaceTracker from './face_tracker';
import * as config from './face_config';
import * as sysutils from 'silk-sysutils';

// Primarily for demoing face training. If enabled, clear trained faces
// after N seconds of not detecting a face.
const FACE_AUTOCLEAR_PROP = 'persist.silk.face.autoclear';
const FACE_AUTOCLEAR_TIMER_SECONDS = 30;

let camera;
let log;
let timeline;

class Main {
  lastFaceDetect: number = 0;
  processingMotion: boolean = false;
  processingPreview: boolean = false;

  constructor(env) {
    camera = env.camera;
    log = env.log;
    timeline = env.timeline;

    this._startFaceProcessing();
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
    this._stopFaceProcessing();
  }

  _startFaceProcessing(): void {
    timeline.on('preview', this.onPreview);
    timeline.on('motion', this.onMotion);
  }

  _stopFaceProcessing(): void {
    timeline.removeListener('preview', this.onPreview);
    timeline.removeListener('motion', this.onMotion);
  }

  async detectFaces(when: number): Promise<void> {
    if (this.processingMotion) {
      log.debug(`onMotion busy, skipping update`);
      return;
    }
    this.processingMotion = true;
    this.lastFaceDetect = Date.now();

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
    // Detect faces only if there are no faces currently being tracked
    if (!this.faceTracker.faces.length) {
      this.detectFaces(when);
    }
  }

  onPreview = async (when: number): Promise<void> => {
    if (this.processingPreview) {
      log.debug(`onPreview busy, skipping update`);
      return;
    }
    this.processingPreview = true;

    // Don't do anything if no faces are available
    if (!this.faceTracker.faces.length) {
      this.processingPreview = false;
      return;
    }

    let [lowgray] = await camera.getFrame(when, ['lowgray']);
    await this.faceTracker.update(when, lowgray);

    // If a face is being tracked, continue to try to detect faces even if
    // there's no motion.  This is to help ensure that the trackers continue to
    // be actually tracking faces.
    const now = Date.now();
    if (Math.abs(this.lastFaceDetect - now) >= config.FACE_DETECT_INTERVAL) {
      this.lastFaceDetect = now;
      await this.detectFaces(when);
    }

    // Update timeline with currently tracked faces
    this.faceTracker.faces.forEach(face => {
      // Wait for face to be identified before adding to the timeline
      if ((face.faceId === null) && (face.recognitionCount < config.WAIT_FOR_RECOGNITION_ATTEMPTS)) {
        log.info(`Waiting for face to be identified ` +
            `(${face.recognitionCount} / ${config.WAIT_FOR_RECOGNITION_ATTEMPTS})`);
        this.processingPreview = false;
        return;
      }
      const name = this.faceRecognizer.faceLabel(face.faceId) || 'unknown face';
      log.debug(`'face' (id: ${face.id} name: ${name}) added to timeline at`,
          face.rectWhen);
      timeline.addObjects(
        [{
          id: face.id,
          tag: 'face',
          persist: true,
          when: face.rectWhen,
          rects: [face.rect],
          source: 'face',
          durationMs: config.FACE_DURATION,
          name,
          faceId: face.faceId,
          percentTrained: face.percentTrained,
          movement: face.movement,
        }]
      );
      face.name = name; // Add name to the face object
    });
    this.processingPreview = false;
  };

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
    log.info(`In autoclear mode, no faces detected for ` +
        `${FACE_AUTOCLEAR_TIMER_SECONDS} secs, removing faces`);

    // Pause face processing while mucking with training data
    this._stopFaceProcessing();
    await this.faceRecognizer.removeAllPersons();
    this._startFaceProcessing();

    log.info(`Done clearing faces`);
  }
}

module.exports = (env) => {
  return new Main(env);
};
