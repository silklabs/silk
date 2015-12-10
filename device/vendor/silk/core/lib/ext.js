/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import createLog from './log';

import fs from 'mz/fs';
import path from 'path';
import { EventEmitter } from 'events';
import * as util from './sysutils';

const log = createLog('ext');
const extDirs = [ '/system/silk/ext', '/data/silk/ext' ];

const RELOAD_EXT_PROP = 'silk.reload-ext';
const ENABLED_SILK_EXTENSIONS = util.getprop('persist.silk.extensions', '*');

class Env extends EventEmitter {

  constructor(name, deviceObjects) {
    super();
    this._name = name;
    this._listenerObjects = [];
    this._addDeviceAPIs(deviceObjects);
  }

  /**
   * Helper routine to register for device events and emit them to the
   * extension device, and properly save listeners.
   */
  _addEvents(deviceName, device, extDevice, events) {
    events.forEach(event => {
      let listener = (...args) => extDevice.emit(event, ...args);
      device.on(event, listener);
      this._saveListener(device, event, listener);
    });
  }

  /**
   * Save enough event listener info so that we can remove during cleanup
   */
  _saveListener(device, event, listener) {
    this._listenerObjects.push({device, event, listener});
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
      let listener = sensorEvent => {
        if (sensorEvent.sensorType !== sensors.SENSOR_TYPE.LIGHT) {
          return;
        }
        this.sensors.emit('light', sensorEvent.values[0]);
      };
      sensors.on('data', listener);
      this._saveListener(sensors, 'data', listener);
    }

    let camera = deviceObjects.camera;
    if (camera) {
      this.camera = new EventEmitter();

      this._addEvents('camera', camera, this.camera, ['mic-data']);

      this.camera.torch = state => {
        camera.flash(state ? camera.FLASH_MODE.TORCH : camera.FLASH_MODE.OFF);
      };
      this.camera.getPreviewFrame = (userCb, when, channel) => {
        camera.getPreviewFrame(userCb, when, channel);
      };
      this.camera.getParameterInt = (name) => {
        return camera.getParameterInt(name);
      };
      this.camera.getParameterStr = (name) => {
        return camera.getParameterStr(name);
      };
    }

    let timeline = deviceObjects.timeline;
    if (timeline) {
      this.timeline = new EventEmitter();

      this._addEvents('timeline', timeline, this.timeline,
          ['preview', 'face', 'clap', 'motion', 'no-motion']);

      this.timeline.addObject = (tag, when, rect) => {
        timeline.addObject(tag, when, rect, this._name);
      };
      this.timeline.addObjects = objs => {
        let newObjs = null;
        if (objs && (objs.length > 0)) {
          newObjs = objs.map(obj => {
            let newObj = obj;
            newObj.source = this._name;
            return newObj;
          });
        }

        timeline.addObjects(newObjs);
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

    let infrared = deviceObjects.infrared;
    if (infrared) {
      this.infrared = {
        MODE: infrared.MODE,
        setMode: mode => {
          infrared.setMode(mode);
        },
      };
    }

    let btle = deviceObjects.btle;
    if (btle) {
      this.ranger = new EventEmitter();
      ['start', 'entered', 'range', 'exited', 'stop'].forEach(event => {
        let listener = (...args) => this.ranger.emit(event, ...args);
        let eventName = 'region-' + event;
        btle.on(eventName, listener);
        this._saveListener(btle, eventName, listener);
      });
    }

    this.util = {
      playSound: fileName => {
        util.playSound(fileName);
      },
      getboolprop: (prop, defaultValue) => {
        return util.getboolprop(prop, defaultValue);
      },
      getintprop: (prop, defaultValue) => {
        return util.getintprop(prop, defaultValue);
      },
      getprop: (prop, defaultValue) => {
        return util.getprop(prop, defaultValue);
      },
      setprop: (prop, value) => {
        util.setprop(prop, value);
      },
      propWatcher: util.propWatcher
    };
  }

  /**
   * Env will be destroyed. Remove listeners.
   */
  cleanup() {
    this._listenerObjects.forEach(listenerObj => {
      listenerObj.device.removeListener(listenerObj.event, listenerObj.listener);
    });
  }

  get log() {
    if (!this._log) {
      this._log = createLog(this._name);
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
    this._disabledList = [];
    this._enabledList = [];

    // Enable/disable extensions
    this._enable(ENABLED_SILK_EXTENSIONS);

    util.propWatcher.on(RELOAD_EXT_PROP, () => this._onReloadRequested());

    extDirs.forEach(dir => {
      fs.readdir(dir)
      .catch(err => {
        if (err && err.code === 'ENOENT') {
          return;
        }
        log.error(`Unable to read ${dir}: ${err}`);
      })
      .then(files => files && files.forEach(file => {
        this._loadExtension(path.join(dir, file));
      }));
    });
  }

  _isModuleNameValid(file) {
    // module names must end in .js, .json, .node or nothing
    let ext = path.extname(file);
    if (!ext.length || ext === '.js' || ext ===  '.json' || ext === '.node') {
      return true;
    } else {
      return false;
    }
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
    if (!this._isModuleNameValid(file)) {
      return;
    }
    let modulePath = this._getModulePath(file);
    if (!this._isEnabled(path.basename(modulePath))) {
      log.verbose(`Module ${file} is disabled`);
      return;
    }
    try {
      if (modulePath in this._loaded) {
        log.warn(`Already loaded, skipping ${modulePath}`);
      } else {
        log.info(`Loading ${modulePath}`);
        let env = new Env(path.basename(modulePath), this._deviceObjects);
        this._loaded[modulePath] = { env: env, mod: require(modulePath)(env) };
      }
    } catch (e) {
      // Failed to load, delete from cache to force next load from disk
      this._removeExtensionFromCache(file);
      log.error(`Extension failed to load: ${modulePath}`);
      log.error(e);
    }
  }

  _removeExtensionFromCache(file) {
    if (require.cache === undefined) {
      // require.cache alias not present for some reason, let's add it
      require.cache = require('module')._cache;
    }
    delete require.cache[file];
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
      .then(() => module.env.cleanup())
      .then(() => {
        this._removeExtensionFromCache(file);
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

  /**
   * Enables/disables extensions using regular expressions
   */
  _enable(namespaces) {
    let split = (namespaces || '').split(/[\s,]+/);
    let len = split.length;

    for (let i = 0; i < len; i++) {
      if (!split[i]) { // ignore empty strings
        continue;
      }
      namespaces = split[i].replace(/\*/g, '.*?');
      if (namespaces[0] === '-') {
        this._disabledList.push(new RegExp('^' + namespaces.substr(1) + '$'));
      } else {
        this._enabledList.push(new RegExp('^' + namespaces + '$'));
      }
    }
  }

  /**
   * Returns true if the given extension is enabled, false otherwise
   *
   * @param {String} name
   * @return {Boolean}
   */
  _isEnabled(name) {
    let i, len;
    for (i = 0, len = this._disabledList.length; i < len; i++) {
      if (this._disabledList[i].test(name)) {
        return false;
      }
    }
    for (i = 0, len = this._enabledList.length; i < len; i++) {
      if (this._enabledList[i].test(name)) {
        return true;
      }
    }
    return false;
  }
}

export default function makeExtensions(deviceObjects) {
  return new Extensions(deviceObjects);
}
