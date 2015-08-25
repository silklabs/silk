/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

let log = require('./log')('ext');
let fs = require('mz/fs');
let path = require('path');
let events = require('events');

const extDirs = [ '/system/silk/ext', '/data/silk/ext' ];

class Env extends events.EventEmitter {

  constructor(name, deviceObjects) {
    super();
    this._name = name;
    this._addDeviceAPIs(deviceObjects);
  }

  /**
   * Builds the interface into the device functions that are available to
   * extensions.
   */
  _addDeviceAPIs(deviceObjects) {
    let sensors = deviceObjects.sensors;
    if (sensors) {
      this.sensors = new events.EventEmitter();
      this.sensors.light = pollInterval => {
        if (!pollInterval) {
          sensors.deactivate(sensors.SENSOR_TYPE.LIGHT);
        } else {
          sensors.activate(sensors.SENSOR_TYPE.LIGHT, pollInterval);
        }
      };
      sensors.on('data', sensorEvent => {
        if (sensorEvent.sensorType !== sensors.SENSOR_TYPE.LIGHT) {
          return;
        }
        this.sensors.emit('light', sensorEvent.values[0]);
      });
    }

    let camera = deviceObjects.camera;
    if (camera) {
      this.camera = new events.EventEmitter();
      this.camera.torch = state => {
        camera.flash(state ? camera.FLASH_MODE.TORCH : camera.FLASH_MODE.OFF);
      };
      this.camera.getPreviewFrame = (userCb, channel) => {
        camera.getPreviewFrame(userCb, channel);
      };
    }

    let timeline = deviceObjects.timeline;
    if (timeline) {
      this.timeline = new events.EventEmitter();
      timeline.on('preview', (when, retrieveFunc) => {
        this.timeline.emit('preview', when, retrieveFunc);
      });
      timeline.on('face', faces => {
        this.timeline.emit('face', faces);
      });
      timeline.on('clap', count => {
        this.timeline.emit('clap', count);
      });
      timeline.on('motion', (when, rects) => {
        this.timeline.emit('motion', when, rects);
      });
      this.timeline.addObject = (tag, when, rect) => {
        timeline.addObject(tag, when, rect);
      };
      this.timeline.addObjects = objs => {
        timeline.addObjects(objs);
      };
    }

    let hue = deviceObjects.hue;
    if (hue) {
      this.hue = {
        setState: state => {
          hue.setState(state);
        },
      };
    }
  }

  get log() {
    if (!this._log) {
      this._log = require('./log')(this._name);
    }
    return this._log;
  }
}


class Extensions {

  constructor(deviceObjects = {}) {
    this.loaded = [];
    this.deviceObjects = deviceObjects;

    extDirs.forEach(dir => {
      fs.readdir(dir)
      .catch(err => {
        if (err && err.code === 'ENOENT') {
          return;
        }
        log.error(`Unable to read ${dir}: ${err}`);
      })
      .then(files => files.forEach(file => this._loadExtension(path.join(dir, file))));
    });
  }


  _loadExtension(file) {
    let ext = path.extname(file);
    let modulePath = ext.length > 0 ? file.slice(0, -ext.length) : file;
    try {
      log.info(`Loading ${modulePath}`);
      let env = new Env(path.basename(modulePath), this.deviceObjects);
      this.loaded.push({ env: env, mod: require(modulePath)(env)});

    } catch (e) {
      log.error(`Extension failed to load: ${modulePath}`);
      log.error(e);
    }
  }
}

export default function makeExtensions(deviceObjects) {
  return new Extensions(deviceObjects);
}
