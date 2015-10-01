/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let log = require('./log')('ext');
let fs = require('mz/fs');
let path = require('path');
let EventEmitter = require('events').EventEmitter;
let util = require('./util');

const RELOAD_EXT_PROP = 'silk.reload-ext';
const extDirs = [ '/system/silk/ext', '/data/silk/ext' ];

class Env extends EventEmitter {

  constructor(name, deviceObjects) {
    super();
    this._name = name;
    this._listeners = {};
    this._addDeviceAPIs(deviceObjects);
  }

  /**
   * Builds the interface into the device functions that are available to
   * extensions.
   */
  _addDeviceAPIs(deviceObjects) {
    let sensors = deviceObjects.sensors;
    if (sensors) {
      this.sensors = new EventEmitter();
      this.sensors.light = pollInterval => {
        if (!pollInterval) {
          sensors.deactivate(sensors.SENSOR_TYPE.LIGHT);
        } else {
          sensors.activate(sensors.SENSOR_TYPE.LIGHT, pollInterval);
        }
      };
      this._listeners.sensors = {};
      let listener = sensorEvent => {
        if (sensorEvent.sensorType !== sensors.SENSOR_TYPE.LIGHT) {
          return;
        }
        this.sensors.emit('light', sensorEvent.values[0]);
      };
      sensors.on('data', listener);
      this._listeners.sensors['data'] = // eslint-disable-line dot-notation
          listener;
    }

    let camera = deviceObjects.camera;
    if (camera) {
      this.camera = new EventEmitter();
      this.camera.torch = state => {
        camera.flash(state ? camera.FLASH_MODE.TORCH : camera.FLASH_MODE.OFF);
      };
      this.camera.getPreviewFrame = (userCb, channel) => {
        camera.getPreviewFrame(userCb, channel);
      };
    }

    let timeline = deviceObjects.timeline;
    if (timeline) {
      this.timeline = new EventEmitter();

      let events = ['preview', 'face', 'clap', 'motion', 'no-motion'];
      this._listeners.timeline = {};

      events.forEach(event => {
        this._listeners.timeline[event] = (...args) => {
          this.timeline.emit(event, ...args);
        };
        timeline.on(event, this._listeners.timeline[event]);
      });

      this.timeline.addObject = (tag, when, rect) => {
        timeline.addObject(tag, when, rect);
      };
      this.timeline.addObjects = objs => {
        timeline.addObjects(objs);
      };
      this.timeline.noMotion = when => {
        timeline.noMotion(when);
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

    let btle = deviceObjects.btle;
    if (btle) {
      this.ranger = new EventEmitter();
      this._listeners.ranger = {};
      ['start', 'entered', 'range', 'exited', 'stop'].forEach(event => {
        let listener = this._listeners.ranger[event] = (...args) => {
          this.ranger.emit(event, ...args);
        };
        btle.on('region-' + event, listener);
      });
    }

    this.util = {
      playSound: fileName => {
        util.playSound(fileName);
      },
      getboolprop: (prop, defaultValue) => {
        return util.getboolprop(prop, defaultValue);
      },
      getprop: (prop, defaultValue) => {
        return util.getprop(prop, defaultValue);
      },
      setprop: (prop, value) => {
        util.setprop(prop, value);
      },
      watchprop: (prop, cb) => {
        return util.watchprop(prop, cb);
      },
    };
  }

  /**
   * Env will be destroyed. Remove listeners.
   */
  cleanup(deviceObjects) {
    let devices = [
      { name: 'btle', eventPrefix: 'ranger-' },
      { name: 'sensors', eventPrefix: '' },
      { name: 'timeline', eventPrefix: '' }
    ];

    devices.forEach(device => {
      let deviceObject = deviceObjects[device.name];
      let deviceListeners = this._listeners[device.name];
      if (deviceListeners) {
        for (let event in deviceListeners) {
          deviceObject.removeListener(device.eventPrefix + event,
                                      deviceListeners[event]);
        }
      }
    });
  }

  get log() {
    if (!this._log) {
      this._log = require('./log')(this._name);
    }
    return this._log;
  }

  get name() {
    return this._name;
  }
}


class Extensions {
  constructor(deviceObjects = {}) {
    this._loaded = {};
    this._watchers = [];
    this._deviceObjects = deviceObjects;

    util.watchprop(RELOAD_EXT_PROP, () => this._onReloadRequested());

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

  _onReloadRequested() {
    // When reload prop changes to non empty string, reload module file
    // specified by prop. When done, clear prop to empty string to indicate done
    let clearReloadProp = () => util.setprop(RELOAD_EXT_PROP, '');
    let file = util.getprop(RELOAD_EXT_PROP);
    if (file) {
      fs.stat(file)
      .then(() => {
        log.info(`Reload requsted ${file}`);
        this._reloadExtension(file);
      }, () => log.info(`Reload requsted, file does not exist ${file}`))
      .then(() => clearReloadProp())
      .catch(() => clearReloadProp());
    }
  }

  /**
   * Send the received command to the loaded extensions. Called when a command
   * intended for extensions is received by the device
   */
  onCommand(cmd) {
    for (let key in this._loaded) {
      let extension = this._loaded[key];
      if (extension.env.name === cmd.targetName) {
        try {
          extension.mod.onCommand(cmd);
        } catch (e) {
          log.warn(`Error sending command to ${extension.env.name}, error: ${e}`);
        }
      }
    }
  }

  _reloadExtension(file) {
    fs.stat(file)
    .then(() => {
      log.info('Extension changed', file);
      this._unloadExtension(file)
      .then(() => this._loadExtension(file),
          () => log.warn('Not reloading', file));
    }, err => {
      if (err.code === 'ENOENT') {
        log.info('Extension removed', file);
        this._unloadExtension(file);
      } else {
        log.warn('Unexpected file error', file, err.code);
      }
    })
    .catch(util.processthrow);
  }

  _getModulePath(file) {
    let ext = path.extname(file);
    return ext.length > 0 ? file.slice(0, -ext.length) : file;
  }

  _loadExtension(file) {
    let modulePath = this._getModulePath(file);
    try {
      if (modulePath in this._loaded) {
        log.warn(`Already loaded, skipping ${modulePath}`);
      } else {
        log.info(`Loading ${modulePath}`);
        let env = new Env(path.basename(modulePath), this._deviceObjects);
        this._loaded[modulePath] = { env: env, mod: require(modulePath)(env) };
      }
    } catch (e) {
      log.error(`Extension failed to load: ${modulePath}`);
      log.error(e);
    }
  }

  _unloadExtension(file) {
    let modulePath = this._getModulePath(file);
    let module = this._loaded[modulePath];

    if (!module) {
      log.info(`Nothing to unload, module not loaded: ${modulePath}`);
      return Promise.resolve();
    } else if (!module.mod || !module.mod.willUnload) {
      log.warn(`Cannot unload, prepareUnload() not supported ${modulePath}`);
      return Promise.reject();
    } else {
      log.info(`Unloading ${modulePath}`);

      return Promise.resolve()
      .then(() => module.mod.willUnload())
      .then(() => module.env.cleanup(this._deviceObjects))
      .then(() => {
        if (require.cache === undefined) {
          // require.cache alias not present for some reason, let's add it
          require.cache = require('module')._cache;
        }
        delete require.cache[file]; // cache is indexed by full file name
        delete this._loaded[modulePath];
        return Promise.resolve();
      })
      .catch(e => {
        log.error(`Extension failed to unload: ${modulePath}`);
        log.error(e);
        return Promise.reject();
      });
    }
  }
}

export default function makeExtensions(deviceObjects) {
  return new Extensions(deviceObjects);
}
