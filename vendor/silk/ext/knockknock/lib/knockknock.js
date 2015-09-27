/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let cv = require('opencv');
let fs = require('mz/fs');

// Face recognition parameters
const RADIUS = 1;
const NEIGHBORS = 8;
const GRID_X = 8;
const GRID_Y = 8;
const THRESHOLD = 80;

const TRAIN_FACES_YML = '/data/silk/opencv/trained_faces.yml';
const TRAIN_FACES_MAP = '/data/silk/opencv/face_map.json';

let log;

/**
 * Listen for all detected faces and try to match them up with the existing
 * face database
 */
class FindFace {
  constructor(env) {
    log = env.log;
    this._env = env;
    this._model = cv.FaceRecognizer.createLBPHFaceRecognizer(RADIUS,
      NEIGHBORS, GRID_X, GRID_Y, THRESHOLD);

    this._trainingInProgress = false;
    this._working = false;

    // Not calling await on purpose so as not to block the constructor
    this._init();
  }

  /**
   * Load training data from a configuration file if available
   */
  _loadTrainingData() {
    log.info(`Loading training data`);
    try {
      this._model.loadSync(TRAIN_FACES_YML);
      this._faceMap = require(TRAIN_FACES_MAP);
      this._start();
    } catch (e) {
      log.error(`Error loading face training data: ${e}`);
    }
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
    let trainfacemodel = require('./trainfacemodel')(this._env);
    await trainfacemodel.start(this._model);
    this._trainingInProgress = false;
  }

  /**
   * Check if training data and face map is available
   * If not train for available faces
   */
  async _init() {
    let existsYml = await fs.exists(TRAIN_FACES_YML);
    let existsFaceMap = await fs.exists(TRAIN_FACES_MAP);
    if (existsYml && existsFaceMap) {
      this._loadTrainingData();
    } else {
      try {
        await this._trainModel();
        this._loadTrainingData();
      } catch (e) {
        log.error(`Error training for faces: ${e}`);
      }
    }
  }

  /**
   * Start running facial recognition on detected faces
   */
  _start() {
    log.info(`Starting face recognition`);
    this._onFace = (faces) => {
      if (faces.length <= 0) {
        return;
      }

      if (this._trainingInProgress) {
        log.info(`Face training in progress; ignoring`);
        return;
      }

      if (this._working) {
        log.error(`Still busy, unable to process next preview image`);
        return;
      }

      this._working = true;
      this._env.camera.getPreviewFrame((err, image) => {
        if (err) {
          log.warning(`Unable to fetch frame: ${err}`);
          this._working = false;
          return;
        }

        // Run facial recognition on each of the detected faces
        faces.forEach(face => {
          let faceim = image.roi(face.x, face.y, face.width, face.height);
          let result = this._model.predictSync(faceim);
          if (result.id !== -1) {
            log.info(`face detected ${JSON.stringify(result)}`);

            // Add the person to timeline
            this._env.timeline.addObject(this._matchIdWithName(result.id), Date.now(), face);
          }
        });
        this._working = false;
      });
    };

    this._env.timeline.on('face', this._onFace);
  }

  /**
   *
   */
  willUnload() {
    if (this._onFace) {
      this._env.timeline.removeListener('face', this._onFace);
    }
  }
}

module.exports = (env) => new FindFace(env);
