/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import CBuffer from 'CBuffer';
import cv from 'opencv';
import {
  Matrix,
  Face,
  FaceId,
} from './face';

import * as config from './face_config';

let log;
let timeline;

import Trainer from './face_trainer';

// Face recognition parameters
const LBPH_RADIUS = 1;

// Higher the value, more time it takes to train the recognizer. With value higher
// value of 8 model is not recognizing faces at all. With lower values model
// returns lot of false positives
const LBPH_NEIGHBORS = 3;

const LBPH_GRID_X = 8;
const LBPH_GRID_Y = 8;


export default class FaceRecognizer {
  _loading: boolean = false;
  _predicting: boolean = false;
  _training: boolean = false;

  _faceMap: ?{[key: FaceId]: string} = null;
  _trainer: Trainer;
  _model: any; // cv.FaceRecognizer

  _nextFaceName: ?string = null;

  constructor(env: any) {
    log = env.log;
    timeline = env.timeline;

    this._model = cv.FaceRecognizer.createLBPHFaceRecognizer(
      LBPH_RADIUS,
      LBPH_NEIGHBORS,
      LBPH_GRID_X,
      LBPH_GRID_Y,
      config.LBPH_THRESHOLD
    );

    this._trainer = new Trainer(env);
    this._init();
  }

  /**
   * Check if training data and face map is available.
   * If not train for available faces
   */
  async _init(forceTraining: boolean = true) {
    this._loading = true;
    this._faceMap = null;

    try {
      this._faceMap = await this._trainer.trainAndLoad(this._model, forceTraining);
    } catch (err) {
      log.warn(`Error loading training data: ${err}`);
    }
    this._loading = false;
  }

  _idle() {
    if (this._loading) {
      log.verbose('FaceRecognizer is loading');
      return false;
    }

    if (this._predicting) {
      log.verbose('FaceRecognizer predicting');
      return false;
    }

    return true;
  }

  faceLabel(faceId: ?FaceId): ?string {
    if (faceId !== null && this._faceMap !== null) {
      return this._faceMap[faceId];
    }
    return null;
  }

  async predict(when: number, faces: Array<Face>, gray: Matrix, fullgray: Matrix): Promise<void> {
    if (!this._idle()) {
      return;
    }
    this._predicting = true;
    const start = Date.now();
    const toNormalScale = fullgray.width() / gray.width();
    for (let face of faces) {
      // Initialize recognizer state if this is the first this face has been
      // processed.
      if (!face.i.recognizer) {
        face.i.recognizer = {
          // Time of the last successful face recognition attempt for this face
          lastWhen: null,
          // Recent history of who this face has been recognized as
          history: new CBuffer(config.INCONSISTENT_FACE_PREDICTION_WINDOW),
          trainingImages: new CBuffer(config.MAX_UNKNOWN_FACE_TRAINING_IMAGES),
        };
        face.i.recognizer.trainingImages.overflow =
          faceim => faceim.release();
      }

      // Run the recognizer if the face is currently unrecognized, or
      // periodically if the face was recognized previously
      let run = !face.faceId ||
                (when - face.i.recognizer.lastWhen > config.RECOGNIZED_FACE_CHECK_INTERVAL);
      if (!run) {
        log.debug(`Face ${face.id} skipping recognizer`);
        continue;
      }

      let faceim = this._trainer.preprocessFace(fullgray, face.rect, toNormalScale);
      if (faceim === null) {
        continue;
      }

      let faceId = null;
      let faceConfidence = null;

      if (this._faceMap !== null) {
        await new Promise(resolve => {     //eslint-disable-line no-loop-func
          this._model.predict(faceim, result => {
            log.debug(`${JSON.stringify(result)}`);
            if (result.id !== -1) {
              faceId = result.id;
              faceConfidence = result.confidence.toFixed();
              const faceName = this.faceLabel(faceId);
              log.debug(`Face detected id:${faceId} ${faceName} confidence:${faceConfidence}`);

              face.name = faceName;
              timeline.addDiagFrame(
                `detected:${faceId}:${faceName}:${faceConfidence}`,
                when,
                faceim
              );
            }
            resolve();
          });
        });
      }

      if (face.faceId === null) {
        if (faceId !== null) {
          // Initial prediction
          log.verbose(`Face ${face.id}: detected faceId ${faceId}`);
          face.faceId = faceId;
          face.percentTrained = 100;
          face.i.recognizer.lastWhen = when;
          face.i.recognizer.history.push(faceId);
        }
      } else {
        face.i.recognizer.history.push(faceId);
        if (face.faceId === faceId) {
          // Re-prediction of the same face, good.
          log.debug(`Face ${face.id} re-detected: ${faceId}`);
          face.i.recognizer.lastWhen = when;
        } else {
          // Oops, predicted a different face (or no face)
          log.verbose(`Face ${face.id} inconsistent.` +
                      `Expected ${face.faceId}, predicted ${faceId}`);

          const predictionHistory = face.i.recognizer.history.toArray();
          let errorCount = predictionHistory.reduce(
            (errorCount, currentId) => {
              return errorCount + (currentId !== null && currentId !== face.faceId ? 1 : 0);
            },
            0
          );
          if (errorCount >= config.MAX_INCONSISTENT_FACE_PREDICTION) {
            // Consistently wrong, revert to unknown face
            log.info(`Face ${face.id}: Too many inconsistent predictions`);
            face.faceId = null;
            face.percentTrained = 0;
            face.i.recognizer.lastWhen = null;
            face.i.recognizer.trainingImages.empty();
          }
        }
      }

      if (face.faceId === null) {
        // Collect training data for the unknown face
        log.debug(`Unknown face at ${JSON.stringify(face.rect)}`);

        const trainingImages = face.i.recognizer.trainingImages;
        trainingImages.push(faceim);
        face.percentTrained =
          Math.min(100,
            Math.round(trainingImages.size / config.MIN_IMAGES_FOR_TRAINING * 100));

        timeline.addDiagFrame(
          `training:${face.id}:${trainingImages.size}`,
          when,
          faceim
        );
        // Run training as soon as enough faces are available
        if (trainingImages.size >= config.MIN_IMAGES_FOR_TRAINING) {
          await this.updateTraining(face);
        }
      } else {
        faceim.release();
      }
      face.recognitionCount++;
    }
    const diff = Date.now() - start;
    log.verbose(`Face recognition finished in ${diff}ms`);

    this._predicting = false;
  }

  async updateTraining(face: Face): Promise<void> {
    let reload = false;
    if (!face.i.recognizer) {
      return; // Never worked on this face, ignore it.
    }
    const trainingImages = face.i.recognizer.trainingImages.toArray();
    if (await this._trainer.addNewFace(trainingImages, this._nextFaceName)) {
      reload = true;
    }
    this._nextFaceName = null;
    face.i.recognizer.trainingImages.forEach(im => im.release());
    face.i.recognizer.trainingImages.empty();
    if (reload) {
      this._init();
    }
  }

  async addPerson(name: string): void {
    log.verbose(`Next face added will be named ${name}`);
    this._nextFaceName = name;
  }

  async removeAllPersons(): void {
    log.info(`Removing all faces and reinitializing`);
    await this._trainer.removeAllFaces();
    await this._init();
  }
}
