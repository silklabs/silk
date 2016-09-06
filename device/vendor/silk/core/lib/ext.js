/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 *
 * @private
 */

import createLog from 'silk-log/device';

import fs from 'mz/fs';
import EventEmitter from 'events';
import path from 'path';
import modwatcher from 'silk-modwatcher';
import * as util from 'silk-sysutils';

import wrapNoEntity from './fs/wrap_no_entity';

const log = createLog('ext');
const extDirs = [ 'system/silk/node_modules' ];

const ENABLED_SILK_EXTENSIONS = util.getprop('persist.silk.extensions', '*');
const SILKEXT_MODULE_PREFIX = 'silkext-';

let nextObjectId = 0;

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
    let newListener = (eventName) => {
      if (events.indexOf(eventName) === -1) {
        log.warn(`Unknown event ${deviceName}/${eventName}`);
        return;
      }
      log.debug(`Adding ${deviceName}/${eventName} listener`);
      let listener = (...args) => extDevice.emit(eventName, ...args);
      device.on(eventName, listener);
      this._saveListener(device, eventName, listener);
    };

    // Don't bother the real object until an extension actually registers a
    // listener on the extension-specific doppelganger object
    //
    // TODO: Listeners are not yet removed from the real object to match a
    //       doppelganger removal (eg, 'preview-fast')
    extDevice.on('newListener', newListener);
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
       * Light event. This event is emitted when light sensor level is available
       *
       * @event light
       * @memberof Env.sensors
       * @type {Object}
       * @property {number} level Light level in SI lux units
       */
      this.sensors = new EventEmitter();

      /**
       * Enable/Disable light sensor.
       *
       * TODO: Probably remove this method and enable/disable light sensor in
       *       main.js just like accelerometer
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

      this.sensors.once('newListener', () => {
        const listener = sensorEvent => {
          switch (sensorEvent.sensorType) {
          case sensors.SENSOR_TYPE.ACCELEROMETER:
            this.sensors.emit('accel',
              sensorEvent.values[0],
              sensorEvent.values[1],
              sensorEvent.values[2],
            );
            break;
          case sensors.SENSOR_TYPE.LIGHT:
            this.sensors.emit('light', sensorEvent.values[0]);
            break;
          default:
            break;
          }
        };
        sensors.on('data', listener);
        this._saveListener(sensors, 'data', listener);
      });
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
       * Obtain a camera frame in one or more formats
       *
       * @param {number} when - timestamp of the frame to get
       * @param {Array<CameraFrameFormat>} formats - requested formats
       * @return {Promise<Array<?cv::Matrix>>}
       * @memberof Env.camera
       * @instance
       */
      this.camera.getFrame = (when, formats) => {
        return camera.getFrame(when, formats);
      };

      /**
       * Returns the camera video size
       *
       * @return {Size}
       * @memberof Env.camera
       * @instance
       */
      this.camera.getVideoSize = () => {
        return camera.videoSize;
      };

      /**
       * Returns the camera frame size
       *
       * @param {CameraFrameSize} frameSize Frame size of interest ('normal' if omitted)
       * @return {Size}
       * @memberof Env.camera
       * @instance
       */
      this.camera.getFrameSize = (frameSize) => camera.getFrameSize(frameSize);

      /**
       * See camera.normalRectsTo()
       */
      this.camera.normalRectsTo = (rects, frameSize) => camera.normalRectsTo(rects, frameSize);

      /**
       * See camera.normalRectsFrom()
       */
      this.camera.normalRectsFrom = (rects, frameSize) => camera.normalRectsFrom(rects, frameSize);

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

      Object.defineProperties(this.camera, {
        'FRAME_DELAY_MS': {
          get: function () {
            return camera.FRAME_DELAY_MS;
          },
        },
        'FAST_FRAME_DELAY_MS': {
          get: function () {
            return camera.FAST_FRAME_DELAY_MS;
          },
        },
      });
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
       * Motion event. This event is emitted when motion is detected by the device
       *
       * @event motion
       * @memberof Env.timeline
       * @type {Object}
       * @property {number} when Timestamp of when the face was seen
       * @property {Array<Rect>} rects Rectangle co-ordinates of the motion
       * @property {string} source Who found this face (ex HAL)
       */

      /**
       * No motion event. This event is emitted when no motion is detected in
       * the last preview frame
       *
       * @event no-motion
       * @memberof Env.timeline
       * @type {Object}
       * @property {number} when Timestamp of when the face was seen
       */
      this._addEvents('timeline', timeline, this.timeline,
          ['preview', 'preview-fast', 'face', 'clap', 'motion', 'no-motion',
           'sound', 'listening', 'processing_speech', 'speaking',
           'speaking_network_error', 'finished_processing_speech']);

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
       * Checks if a diag frame for the given id is enabled.
       * If disabled, calling addDiagFrame() with the given id will be a no-op.
       *
       * @param id  A simple string to associated with this processed frame
       * @return {boolean}
       * @memberof Env.timeline
       * @instance
       */
      this.timeline.diagFrameEnabled = (id: string) => {
        return timeline.diagFrameEnabled(`${this._name}:${id}`);
      };

      /**
       * Add objects to timeline
       *
       * @param {Array<TimelineEventObject>} objs List of objects to be
       *                                     added to the timeline
       * @memberof Env.timeline
       * @instance
       */
      this.timeline.addObjects = (objs) => {
        timeline.addObjects(objs);
      };

      /**
       * Get the next object id to use with timeline.
       *
       * @memberof Env.timeline
       * @instance
       */
      this.timeline.getNextObjectId = () => {
        return timeline.getNextObjectId();
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

      this.timeline.getNextObjectId = () => {
        return ++nextObjectId;
      };
    }

    /**
     * Class that provides functionlity to receive events from the ui
     * @memberof Env
     */
    let ui = deviceObjects.ui;
    if (ui) {
      this.ui = new EventEmitter();

      /**
       * Key event. This event is emitted when a key is pressed or released.
       * TODO: REMOVE THIS EVENT.  USE 'silk-input` INSTEAD
       *
       * @event key
       * @memberof Env.ui
       * @type {Object}
       * @property {string} key Specific key that is generating the event
       * @property {string} type Type of key event: ['up', 'down']
       */
      this.ui.getState = function() {
        return deviceObjects.ui.getState();
      };
      this._addEvents('ui', ui, this.ui, ['key', 'state']);
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
      this.ranger.once('newListener', () => {
        ['start', 'entered', 'range', 'exited', 'stop'].forEach(event => {
          let listener = (...args) => this.ranger.emit(event, ...args);
          let eventName = 'region-' + event;
          btle.on(eventName, listener);
          this._saveListener(btle, eventName, listener);
        });
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

    // Very sorry!! Remove once connections.js is moved into its own module
    this.dialogChannel = deviceObjects.dialogChannel;
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
    extDirs.forEach(dir => {
      modwatcher.monitor(path.join(dir, SILKEXT_MODULE_PREFIX + '*'),
                         this._extModulePush);
    });

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
  _extModulePush = async (extName) => {
    log.info(`Reload requsted: ${extName})`);
    await this._unloadExtension(extName);
    await this._loadExtension(extName);
  };

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
    const moduleBasename = path.basename(modulePath);
    if (!moduleBasename.startsWith(SILKEXT_MODULE_PREFIX)) {
      return false; // Not a silkext
    }
    if (!this._isEnabled(moduleBasename)) {
      log.verbose(`Module ${file} is disabled`);
      return false;
    }
    try {
      if (modulePath in this._loaded) {
        log.warn(`Already loaded, skipping ${modulePath}`);
      } else {
        log.info(`Loading ${modulePath}`);
        let env = new Env(moduleBasename, this._deviceObjects);
        let mod = modwatcher.require(modulePath);
        this._loaded[modulePath] = {
          env,
          // Old-style extensions want an Env object.
          // New-style extensions are on their own.
          mod: typeof mod === 'function' ? mod(env) : mod,
        };
      }
    } catch (e) {
      // Failed to load, delete from cache to force next load from disk
      modwatcher.flush(modulePath);
      log.error(`Extension failed to load: ${modulePath}`);
      log.error(e);
    }
    return true;
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
    } else {
      log.info(`Unloading ${modulePath}`);

      return Promise.resolve()
      .then(() => {
        // Deal with old-style extensions
        if (module.mod.willUnload) {
          module.mod.willUnload();
        }
      })
      .then(() => module.env.cleanup())
      .then(() => {
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
        this._disabledList.push(new RegExp('^silkext-' + namespaces.substr(1) + '$'));
      } else {
        this._enabledList.push(new RegExp('^silkext-' + namespaces + '$'));
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
