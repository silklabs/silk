/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 *
 * @private
 */

import createLog from './log';

import fs from 'mz/fs';
import path from 'path';
import { EventEmitter } from 'events';
import * as util from './sysutils';
import wrapNoEntity from './fs/wrap_no_entity';

const log = createLog('ext');
const extDirs = [ 'system/silk/ext', 'data/silk/ext' ];

const RELOAD_EXT_PROP = 'silk.reload-ext';
const ENABLED_SILK_EXTENSIONS = util.getprop('persist.silk.extensions', '*');

/**
 * Class that provides Silk SDK APIs to extensions/behaviors
 *
 * @param {string} name Name of the extension/behavior
 * @param {Array<objects>} deviceObjects List of available device modules
 */
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
   * @private
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
   * @private
   */
  _saveListener(device, event, listener) {
    this._listenerObjects.push({device, event, listener});
  }

  /**
   * Builds the interface into the device functions that are available to
   * extensions.
   * @private
   */
  _addDeviceAPIs(deviceObjects) {

    /**
     * This module exposes functionality to activate/deactivate and read sensors
     * data from various sensors avaialble on the device.
     * @memberof Env
     */
    let sensors = deviceObjects.sensors;
    if (sensors) {
      /**
       * Light event. This event is emiited when light sensor level is available
       *
       * @event light
       * @memberof Env.sensors
       * @type {Object}
       * @property {number} level Light level in SI lux units
       */
      this.sensors = new EventEmitter();

      /**
       * Enable/Disable light sensor
       *
       * @param {number} pollInterval Interval in ms at which to poll for light
       *        values
       * @memberof Env.sensors
       * @instance
       */
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

    /**
     * Class that provides functionality to interact with camera module on the
     * device
     * @memberof Env
     */
    let camera = deviceObjects.camera;
    if (camera) {
      this.camera = new EventEmitter();

      this._addEvents('camera', camera, this.camera, ['mic-data']);

      /**
       * Turn on/off torch light
       *
       * @param {boolean} state Turn on/off the torch light
       * @memberof Env.camera
       * @instance
       */
      this.camera.torch = state => {
        camera.flash(state ? camera.FLASH_MODE.TORCH : camera.FLASH_MODE.OFF);
      };

      /**
       * Get preview frame
       *
       * @param {CameraCallback} userCb Callback that receives the requested frames
       * @param {number} when Timestamp of when the camera frame was fetched
       *        from the camera sensor
       * @param {number} channel 0 for RGB
       *                         1 for grayscale equalized
       * @memberof Env.camera
       * @instance
       */
      this.camera.getPreviewFrame = (userCb, when, channel) => {
        camera.getPreviewFrame(userCb, when, channel);
      };

      /**
       * Get camera parameter as integer. This function returns a Promise that resolves
       * when the parameter value is successfully retrieved
       *
       * @param {string} name Name of the parameter
       * @return {Promise}
       * @memberof Env.camera
       * @instance
       */
      this.camera.getParameterInt = /* async */ (name) => {
        return camera.ready()
        .then(() => camera.getParameterInt(name));
      };

      /**
       * Get camera parameter as string. This function returns a Promise that resolves
       * when the parameter value is successfully retrieved
       *
       * @param {string} name Name of the parameter
       * @return {Promise}
       * @memberof Env.camera
       * @instance
       */
      this.camera.getParameterStr = /* async */ (name) => {
        return camera.ready()
        .then(() => camera.getParameterStr(name));
      };
    }

    /**
     * Class that provides functionlity to send and receive objects to the
     * timeline
     * @memberof Env
     */
    let timeline = deviceObjects.timeline;
    if (timeline) {
      this.timeline = new EventEmitter();

      /**
       * Preview event. This event is emitted when a preview is available
       *
       * @event preview
       * @memberof Env.timeline
       * @type {Object}
       * @property {number} when Time when the preview was generated
       */

      /**
       * Face event. This event is emitted when a face is detected by the device
       *
       * @event face
       * @memberof Env.timeline
       * @type {Object}
       * @property {number} when Timestamp of when the face was seen
       * @property {Array<Rect>} faces Rectangle co-ordinates of the faces
       * @property {string} source Who found this face (ex HAL)
       */

      /**
       * Clap event. This event is emitted when a clap is heard by the device
       *
       * @event clap
       * @memberof Env.timeline
       * @type {Object}
       * @property {number} count of number of claps heard
       */

      /**
       * Motion event. This event is emiited when motion is detected by the device
       *
       * @event motion
       * @memberof Env.timeline
       * @type {Object}
       * @property {number} when Timestamp of when the face was seen
       * @property {Array<Rect>} rects Rectangle co-ordinates of the motion
       * @property {string} source Who found this face (ex HAL)
       */

      /**
       * No motion event. This event is emiited when no motion is detected in
       * the last preview frame
       *
       * @event no-motion
       * @memberof Env.timeline
       * @type {Object}
       * @property {number} when Timestamp of when the face was seen
       */
      this._addEvents('timeline', timeline, this.timeline,
          ['preview', 'face', 'clap', 'motion', 'no-motion']);

      /**
       * Add a processed frame
       *
       * @param id  A simple string to associated with this processed frame
       * @param when Timestamp that the frame is correlated with
       * @param frame OpenCV matrix
       * @memberof Env.timeline
       * @instance
       */
      this.timeline.addDiagFrame = (id: string, when: number, frame: any) => {
        // TODO: It would be better to pass this into diag instead of timeline.
        //       Do this once more ext-facing Diag features are enabled (such as
        //       toggling diag frames on an extension basis)
        timeline.addDiagFrame(`${this._name}:${id}`, when, frame);
      };

      /**
       * Add an object to timeline
       *
       * @param {string} tag Type of the object detected
       * @param {number} when [] Time when the object was detected
       * @param {Rect} rect [] Rectangle co-ordinates of the object
       * @memberof Env.timeline
       * @instance
       */
      this.timeline.addObject = (tag, when, rect) => {
        timeline.addObject(tag, when, rect, this._name);
      };

      /**
       * Add objects to timeline
       *
       * @param {Array<TimelineEventObject>} objs List of objects to be
       *                                     added to the timeline
       * @memberof Env.timeline
       * @instance
       */
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

      /**
       * Report that there is no motion detected in the preview image
       *
       * @param {number} when Timestamp of the preview image
       * @memberof Env.timeline
       * @instance
       */
      this.timeline.noMotion = when => {
        timeline.noMotion(when);
      };
    }

    /**
     * Class that provides functionlity to control Hue lights
     * @memberof Env
     */
    let hue = deviceObjects.hue;
    if (hue) {
      this.hue = {
        /**
         * Set the state of hue lights
         *
         * @param {Object} state of hue lights to set
         * @memberof Env.hue
         * @instance
         */
        setState: state => {
          hue.setState(state);
        },
      };
    }

    /**
     * Class that provides functionlity to control the infrared module on the
     * device
     * @memberof Env
     */
    let infrared = deviceObjects.infrared;
    if (infrared) {
      this.infrared = {
        /**
         * @property {Mode} MODE Infrared mode
         * @memberof Env.infrared
         */
        MODE: infrared.MODE,

        /**
         * Set infrared mode
         *
         * @param {Mode} mode Set infrared mode
         * @memberof Env.infrared
         * @instance
         */
        setMode: mode => {
          infrared.setMode(mode);
        },
      };
    }

    /**
     * Class that provides functionality to control Bluetooth low energy
     * module on the device
     * @name ranger
     * @namespace
     * @memberof Env
     */
    let btle = deviceObjects.btle;
    if (btle) {
      /**
       * Start event. This event is emitted when BTLE ranger has started
       *
       * @event start
       * @memberof Env.ranger
       * @type {Object}
       */

      /**
       * Entered event. This event is emitted when a beacon has entered the region
       *
       * @event entered
       * @memberof Env.ranger
       * @type {Object}
       * @property {number} Unique ID of the beacon
       * @property {number} RSSI signal strength of the beacon
       */

      /**
       * Range event. This event is emitted to report the RSSI of the beacon in
       * range
       *
       * @event range
       * @memberof Env.ranger
       * @type {Object}
       * @property {number} Unique ID of the beacon
       * @property {number} RSSI signal strength of the beacon
       */

      /**
       * Exited event. This event is emitted when beacon has exited the region
       * range
       *
       * @event exited
       * @memberof Env.ranger
       * @type {Object}
       * @property {number} Unique ID of the beacon
       */

      /**
       * Stop event. This event is emitted when BTLE ranger has stopped
       *
       * @event stop
       * @memberof Env.ranger
       * @type {Object}
       */

      this.ranger = new EventEmitter();
      ['start', 'entered', 'range', 'exited', 'stop'].forEach(event => {
        let listener = (...args) => this.ranger.emit(event, ...args);
        let eventName = 'region-' + event;
        btle.on(eventName, listener);
        this._saveListener(btle, eventName, listener);
      });
    }

    /**
     * Class that provides functionlity to convert text to speech
     * @memberof Env
     */
    let say = deviceObjects.say;
    if (say) {
      this.say = {
        /**
         * Speak the provided text
         *
         * @param {string} text Text to convert to speech
         * @memberof Env.say
         * @instance
         */
        speak: text => {
          say.speak(text);
        },
      };
    }

    /**
     * Class that provides utiltiy methods
     * @memberof Env
     */
    this.util = {
     /**
       * Play a sound file
       *
       * @param {string} fileName Name of the audio file to play
       * @memberof Env.util
       * @instance
       */
      playSound: fileName => {
        util.playSound(fileName);
      },

      /**
       * Get value of an android property as boolean
       *
       * @param {string} prop Name of the property to fetch
       * @param {boolean} defaultValue Default value to use if property is not
       *                  available
       * @return {boolean}
       * @memberof Env.util
       * @instance
       */
      getboolprop: (prop, defaultValue) => {
        return util.getboolprop(prop, defaultValue);
      },

      /**
       * Get value of an android property as integer
       *
       * @param {string} prop Name of the property to fetch
       * @param {integer} defaultValue Default value to use if property is not
       *                  available
       * @return {integer}
       * @memberof Env.util
       * @instance
       */
      getintprop: (prop, defaultValue) => {
        return util.getintprop(prop, defaultValue);
      },

      /**
       * Get value of an android property
       *
       * @param {string} prop Name of the property to fetch
       * @param {string} defaultValue Default value to use if property is not
       *                  available
       * @return {PropTypes}
       * @memberof Env.util
       * @instance
       */
      getprop: (prop, defaultValue) => {
        return util.getprop(prop, defaultValue);
      },

      /**
       * Set value of an android property as boolean
       *
       * @param {string} prop Name of the property to set
       * @param {PropTypes} value Property value
       * @memberof Env.util
       * @instance
       */
      setprop: (prop, value) => {
        util.setprop(prop, value);
      },

      /**
       * Get an instance of property wathcer
       *
       * @property {PropWatcher} propWatcher
       * @memberof Env.util
       * @instance
       */
      propWatcher: util.propWatcher,
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

  /**
   * Get the instance of log object
   *
   * @return {object}
   */
  get log() {
    if (!this._log) {
      this._log = createLog(this._name);
    }
    return this._log;
  }

  /**
   * Get the name of the extension
   * @return {string}
   */
  get name() {
    return this._name;
  }
}

/**
 * Class that looks for all available extensions/behaviors and loads them
 *
 * @param {Array<objects>} deviceObjects List of available device modules
 */
class Extensions {
  static async load(deviceObjects) {
    let ext = new Extensions(deviceObjects);
    await ext._init();
    return ext;
  }

  // Use Extensions.load(), not this constructor!
  constructor(deviceObjects = {}) {
    this._loaded = {};
    this._watchers = [];
    this._deviceObjects = deviceObjects;
    this._disabledList = [];
    this._enabledList = [];

    // Enable/disable extensions
    this._enable(ENABLED_SILK_EXTENSIONS);
  }

  /**
   * @private
   */
  async _init() {
    for (const dir of extDirs) {
      const files = await wrapNoEntity(fs.readdir(dir), []);
      for (const file of files) {
        if (await this._loadExtension(path.join(dir, file))) {
          // The timeout here was selected by monitoring 'main thread bogged
          // down' log messages
          await util.timeout(100);
        }
      }
    }
    util.propWatcher.on(RELOAD_EXT_PROP, this._onReloadRequested);
  }

  /**
   * @private
   */
  _isModuleNameValid(file) {
    // module names must end in .js, .json, .node or nothing (directory)
    let ext = path.extname(file);
    return !ext.length || ext === '.js' || ext === '.json' || ext === '.node';
  }

  /**
   * @private
   */
  _onReloadRequested = () => {
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
  };

  /**
   * Send the received command to the loaded extensions. Called when a command
   * intended for extensions is received by the device
   *
   * @param {Object} cmd Command to be sent to the specified extension
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

  /**
   * @private
   */
  _reloadExtension(file) {
    fs.stat(file)
    .then(() => {
      log.info('Extension changed', file);
      this._unloadExtension(file)
      .then(() => this._loadExtension(file))
      .catch(() => log.warn('Not reloading', file));
    }, err => {
      if (err.code === 'ENOENT') {
        log.info('Extension removed', file);
        this._unloadExtension(file)
        .catch(() => log.warn('Error unloading', file));
      } else {
        log.warn('Unexpected file error', file, err.code);
      }
    })
    .catch(util.processthrow);
  }

  /**
   * @private
   */
  _getModulePath(file) {
    let ext = path.extname(file);
    return path.resolve(ext.length > 0 ? file.slice(0, -ext.length) : file);
  }

  /**
   * @private
   */
  async _loadExtension(file) {
    if (!this._isModuleNameValid(file)) {
      return false;
    }
    let modulePath = this._getModulePath(file);
    if (!this._isEnabled(path.basename(modulePath))) {
      log.verbose(`Module ${file} is disabled`);
      return false;
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
    return true;
  }

  /**
   * @private
   */
  _removeExtensionFromCache(file) {
    if (require.cache === undefined) {
      // require.cache alias not present for some reason, let's add it
      require.cache = require('module')._cache;
    }
    delete require.cache[file];
  }

  /**
   * @private
   */
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
   * @private
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
   * @param {string} name
   * @return {boolean}
   * @private
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

export default /*async*/ function makeExtensions(deviceObjects) {
  return Extensions.load(deviceObjects);
}
