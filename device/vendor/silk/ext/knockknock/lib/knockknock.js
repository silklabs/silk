/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import cv from 'opencv';
import fs from 'mz/fs';
import Trainer from './trainer';

/* Face recognition parameters */
const RADIUS = 1;

// Higher the value, more time it takes to train the recognizer. With value higher
// value of 8 model is not recognizing faces at all. With lower values model
// returns lot of false positives
const NEIGHBORS = 3;

const GRID_X = 8;
const GRID_Y = 8;

// Represents the threshold for the confidence value returned by the model. If
// the confidence is more than the threshold, model returns an unknown person.
// Higher the threshold more false postives the model returns. Lower the threshold
// bigger the face rectangle required for successful recognition.
const THRESHOLD = 60;

// Used by Eigenface and Fisherface algorithms
// Sets how confident the Face Verification algorithm should be to decide if it
// is an unknown person or a known person. This value is based on experimentation
// by starting with a known threshold value from https://github.com/
// MasteringOpenCV/code/blob/master/Chapter8_FaceRecognition/main.cpp#L41
// Note that a higher threshold value means accepting more faces as known people,
// whereas lower values mean more faces will be classified as "unknown".
const UNKNOWN_PERSON_THRESHOLD = 0.65;

const TRAIN_FACES_YML = '/data/silk/opencv/face_model.yml';
const TRAIN_FACES_MAP = '/data/silk/opencv/face_map.json';
const ADD_COMMAND_PROP = 'silk.addperson';
const FACE_RECOGNIZER_PROP = 'persist.silk.facerecognizer';

let log;

/**
 * Listen for all detected faces and try to match them up with the existing
 * face database
 */
class FindFace {
  constructor(env) {
    log = env.log;
    this._env = env;
    this._faceMap = null;
    this.faceRecognizer = env.util.getprop(FACE_RECOGNIZER_PROP, 'LBPH');

    // Create facial recognizer model based on the {@code FACE_RECOGNIZER} prop
    switch(this.faceRecognizer) {
    case 'LBPH':
      this._model = cv.FaceRecognizer.createLBPHFaceRecognizer(RADIUS,
          NEIGHBORS, GRID_X, GRID_Y, THRESHOLD);
      log.verbose(`Using LBPH face recognizer`);
      break;
    case 'Eigen':
      this._model = cv.FaceRecognizer.createEigenFaceRecognizer();
      log.verbose(`Using Eigen face recognizer`);
      break;
    case 'Fisher':
      this._model = cv.FaceRecognizer.createFisherFaceRecognizer();
      log.verbose(`Using Fisher face recognizer`);
      break;
    default:
      log.error(`Invalid face recognizer method ${this.faceRecognizer}`);
      this._model = null;
    }

    this._trainingInProgress = false;
    this._working = false;
    this._trainer = new Trainer(env);
    this._idMap = {};

    // Not calling await on purpose so as not to block the constructor
    if (this._model !== null) {
      this._init();
    }
  }

  /**
   * Called when a command directed for this extension is recieved by the device
   *
   * @cmd Command data
   */
  async onCommand(cmd) {
    switch (cmd.msg) {
    case 'addPerson':
      this._trainingInProgress = true;
      log.info(`addPerson command: ${JSON.stringify(cmd)}`);
      await this._trainer.addPerson(cmd.person);

      // Finished adding the person; re-train face model
      log.info(`Finished adding person ${cmd.person}`);
      await this._trainModel();
      await this._loadTrainingData();
      break;
    default:
      break;
    }
  }

  /**
   *
   */
  willUnload() {
    if (this._onFace) {
      this._env.timeline.removeListener('face', this._onFace);
    }
    if (this._propWatcherListener) {
      this._env.util.propWatcher.removeListener(ADD_COMMAND_PROP,
          this._propWatcherListener);
    }
  }

  /**
   * Load training data from a configuration file if available
   */
  async _loadTrainingData() {
    let loaded = false;
    try {
      this._faceMap = null;
      if (await fs.exists(TRAIN_FACES_YML)) {
        this._model.loadSync(TRAIN_FACES_YML);
        if (await fs.exists(TRAIN_FACES_MAP)) {
          let faceMapJson = await fs.readFile(TRAIN_FACES_MAP);
          this._faceMap = JSON.parse(faceMapJson);
          loaded = true;
          log.debug(`${JSON.stringify(this._faceMap)}`);
        }
      }
    } catch (e) {
      log.warn(`Error loading face training data: ${e.stack}`);
    }
    log.verbose(`Face training data loaded: ${loaded}`);
  }

  /**
   * Match an id returned by opencv with the names database available at
   * {@code TRAIN_FACES_MAP}
   */
  _matchIdWithName(id) {
    return this._faceMap[id];
  }

  /**
   * Train face recognition model
   */
  async _trainModel() {
    this._trainingInProgress = true;
    try {
      await this._trainer.start(this._model);
    } catch (err) {
      log.warn(`Error training for faces: ${err}`);
    }
    this._trainingInProgress = false;
  }

  /**
   * Add a person if {@code ADD_COMMAND_PROP} is set
   */
  _addCommandProp() {
    let person = this._env.util.getprop(ADD_COMMAND_PROP);
    log.info(`Property ${ADD_COMMAND_PROP} changed to ${person}`);
    setTimeout(() => this.onCommand({msg: 'addPerson', person: person}));
  }

  /**
   * Check if training data and face map is available
   * If not train for available faces
   */
  async _init() {
    this._propWatcherListener = () => this._addCommandProp();
    this._env.util.propWatcher.on(ADD_COMMAND_PROP, this._propWatcherListener);

    const existsYml = await fs.exists(TRAIN_FACES_YML);
    const existsFaceMap = await fs.exists(TRAIN_FACES_MAP);
    if (!existsYml || !existsFaceMap) {
      await this._trainModel();
    }
    await this._loadTrainingData();
    this._start();
  }

  /**
   * Promises a prediction from FaceRecognizer
   */
  _predict(faceim) {
    if (!this._faceMap) {
      return Promise.reject(`faceMap not found`);
    }
    return new Promise((resolve, reject) => {
      let similarity = UNKNOWN_PERSON_THRESHOLD;

      // For eigenface and fisherface type of model the confidence number is
      // very unreliable so use facial reconstruction instead
      if (this.faceRecognizer !== 'LBPH') {
        let reconstructedFace = this._trainer.reconstructFace(this._model, faceim);
        if (!reconstructedFace) {
          return reject(`can not reconstruct face`);
        }

        // Verify whether the reconstructed face looks like the preprocessed face,
        // otherwise it is probably an unknown person
        similarity = this._trainer.getSimilarity(faceim, reconstructedFace);
        if (similarity >= UNKNOWN_PERSON_THRESHOLD) {
          return reject(`similarity ${similarity} >= ${UNKNOWN_PERSON_THRESHOLD}`);
        }
      }

      this._model.predict(faceim, (result) => {
        log.debug(`${JSON.stringify(result)}`);
        if (result.id !== -1) {
          if (this.faceRecognizer !== 'LBPH') {
            return resolve([result.id, similarity]);
          }
          return resolve([result.id, result.confidence]);
        }
        return reject(`identity is unknown`);
      });
    });
  }

  /**
   * Start running facial recognition on detected faces
   */
  _start() {
    log.info(`Starting face recognition`);
    this._onFace = (when, faces, source) => {
      if (faces.length <= 0) {
        // Clear id map as there are no more faces detected
        this._idMap = {};
        return;
      }

      if (this._trainingInProgress) {
        log.info(`Face training in progress; ignoring`);
        return;
      }

      if (this._working) {
        log.debug(`Still busy, unable to process next preview image`);
        return;
      }

      this._working = true;
      this._env.camera.getPreviewFrame((err, image, orig) => {
        if (err) {
          log.warn(`Unable to fetch frame: ${err}`);
          this._working = false;
          return;
        }

        // Run facial recognition on each of the detected faces
        let start = Date.now();
        faces.forEach(async (face) => {
          // If a name with the id is available then no need to run facial
          // recognition again
          if (face.id) {
            let name = this._idMap[face.id];
            if (name) {
              log.info(`face.id: ${face.id} name: ${name}`);
              this._env.timeline.addObject(name, when, face);
              return;
            }
          }

          // Calculate preview scale
          let previewScale = orig.width() / image.width();

          let faceim = this._trainer.preprocessFace(orig, face, previewScale);
          if (!faceim) {
            return;
          }
          try {
            const [id, confidence] = await this._predict(faceim);
            log.info(`face detected id:${id} ` +
                `${this._matchIdWithName(id)} ` +
                `confidence/similarity: ${confidence} source:${source}`);

            // Add the person to timeline
            let name = this._matchIdWithName(id);
            this._env.timeline.addObject(name, when, face);

            // Cache name with face.id to skip face recognition next time
            // a face with the same ID is reported by HAL
            if (face.id) {
              this._idMap[face.id] = name;
            }
          } catch (ex) {
            // Unknown face
            log.debug(`Unknown face detected: why=${ex}`);
            this._env.timeline.addObject('a face', when, face); // See #1306 for 'a face' vs 'face'
          }
        });
        let diff = Date.now() - start;
        log.verbose(`Face recognition finished in ${diff}ms`);
        this._working = false;
      }, when, 1 /* == 1 channel image (RGB not required) */);
    };

    this._env.timeline.on('face', this._onFace);
  }
}

module.exports = (env) => new FindFace(env);
