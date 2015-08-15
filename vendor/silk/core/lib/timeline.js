/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let log = require('./log')('timeline');
import { EventEmitter } from 'events';

/**
 * Class that receives events from various components synchronizes them and send
 * to the server
 *
 */
class Timeline extends EventEmitter {
  constructor() {
    super();
  }


  /**
   *
   */
  addPreview(when, jpeg) {
    this.emit('preview', when, jpeg);
  };

  /**
   *
   */
  addVideo(when, frame) {
    log.info(`add video: ${when} ${frame}`);
  };

  /**
   *
   */
  addFace(faces) {
    this.emit('face', faces);
  };

  addObjects(objects) {
  }

  addObject(tag, when, rect) {
  }
}

module.exports = new Timeline();
