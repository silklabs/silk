/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import cv from 'opencv';
import fs from 'mz/fs';
import path from 'path';

const TRAIN_FACES_PATH = '/data/silk/opencv/faces';
const TRAIN_FACES_YML = '/data/silk/opencv/face_model.yml';
const TRAIN_FACES_MAP = '/data/silk/opencv/face_map.json';
const FACE_COUNT = 50;
const FACE_PADDING = 5;

let log;

/**
 * Checks whether a path starts with or contains a hidden file or a folder
 *
 * @param {string} source - The path of the file that needs to be validated
 * returns {boolean} - `true` if the source is blacklisted and otherwise `false`
 */
let isHiddenPath = function (file) {
  return (/(^|\/)\.[^\/\.]/g).test(file);
};

/**
 * This class prepares the training data needed for face recognition and them
 * trains the face recognizer using the training data
 */
class TrainFaces {
  constructor(env) {
    this._env = env;
    log = env.log;
    this._trainingData = [];
    this._faceMap = {};
  }

  /**
   * Start face training
   *
   * @param model Face recognizer to be trained
   */
  async start(model) {
    log.info(`Collecting data for face training`);

    // Find everyone for whom we have faces available
    let people = null;
    people = await fs.readdir(TRAIN_FACES_PATH);
    log.debug(`Done reading ${TRAIN_FACES_PATH} and found ${people.length} people`);
    for (let count = 0; count < people.length; count++) {
      if (isHiddenPath(people[count])) {
        log.info(`Ignoring directory ${people[count]}`);
        continue;
      }

      // For each person find all faces and to the training set
      await this._findFaces(count, path.join(TRAIN_FACES_PATH, people[count]));

      // Add id to the face map
      this._faceMap[count] = people[count];
    }

    if (this._trainingData.length <= 0) {
      throw new Error(`No faces available to train; skipping face training`);
    }

    // Train the model using the collected training data
    log.info(`Face training in progress`);
    let start = Date.now();
    model.trainSync(this._trainingData);

    // Save training data in a file
    model.saveSync(TRAIN_FACES_YML);

    // Save face map in a file
    let err = await fs.writeFile(TRAIN_FACES_MAP, JSON.stringify(this._faceMap));
    if (err) {
      throw new Error(`Failed to save ${TRAIN_FACES_MAP}`);
    }

    let diff = Date.now() - start;
    log.info(`Face training finished in ${diff}ms`);
  }

  /**
   * Find faces in the specified directory and add them to the training set
   *
   * @param id integer uniquely identifying this person
   * @param faceDir directory path where faces for this person is stored
   */
  async _findFaces(id, faceDir) {
    try {
      let files = await fs.readdir(faceDir);
      for (let count = 0; count < files.length; count++) {
        let file = files[count];
        if (isHiddenPath(file)) {
          log.info(`Ignoring file ${file}`);
          continue;
        }
        log.debug(`Adding file ${path.join(faceDir, file)}`);
        this._trainingData.push([id, path.join(faceDir, file)]);
      }
    } catch (e) {
      log.warn(`No faces available for ${faceDir}`);
      return;
    }
  }

  /**
   * Start collecting faces for the specified person and store the resulting
   * face set to be later used for training for that person
   *
   * @param person String name of the person to train
   */
  addPerson(person) {
    log.info(`Adding faces for ${person}`);
    let faceCount = 1;
    let facePath = path.join(TRAIN_FACES_PATH, person);

    return new Promise((resolve, reject) => {
      fs.mkdir(facePath)
      .catch(e => {
        if (e.code !== 'EEXIST') {
          log.error(`Failed to create ${facePath}, error: ${e}`);
          reject();
        }
      });

      this._onFace = (when, faces, source) => {
        if ((faces.length <= 0) || (source === 'hal')) {
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

          // Save the face
          this._working = false;
          faces.forEach(face => {
            let faceim = new cv.Matrix(image, face.x, face.y, face.width, face.height);
            faceim.adjustROI(FACE_PADDING, FACE_PADDING, FACE_PADDING, FACE_PADDING);
            log.info(`Saving ${facePath}/${person}_${Date.now()}.jpg, count: ${faceCount}`);
            faceim.save(`${facePath}/${person}_${Date.now()}.jpg`);
            faceCount++;
          });

          if (faceCount >= FACE_COUNT) {
            this._env.timeline.removeListener('face', this._onFace);
            resolve();
          }
        }, 1 /* == 1 channel image (RGB not required) */);
      };

      this._env.timeline.on('face', this._onFace);
    });
  }
}

module.exports = env => new TrainFaces(env);
