/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let util = require('./util');
let events = require('events');
let net = require('net');
let log = require('./log')('sensors');

const SENSORS_SOCKET_NAME = '/dev/socket/sensors';
const SENSORS_COMMAND_NAME = 'SensorsCommand';

/**
 * Sensor types as defined in <hardware/sensors.h>
 */
let SENSOR_TYPE = {
  ACCELEROMETER: 1,
  MAGNETIC_FIELD: 2,
  ORIENTATION: 3,
  GYROSCOPE: 4,
  LIGHT: 5,
  PRESSURE: 6,
  TEMPERATURE: 7,
  PROXIMITY: 8,
  GRAVITY: 9,
  LINEAR_ACCELERATION: 10,
  ROTATION_VECTOR: 11,
  RELATIVE_HUMIDITY: 12,
  AMBIENT_TEMPERATURE: 13,
  MAGNETIC_FIELD_UNCALIBRATED: 14,
  GAME_ROTATION_VECTOR: 15,
  GYROSCOPE_UNCALIBRATED: 16,
  SIGNIFICANT_MOTION: 17,
  STEP_DETECTOR: 18,
  STEP_COUNTER: 19,
  GEOMAGNETIC_ROTATION_VECTOR: 20,
  HEART_RATE: 21,
  TILT_DETECTOR: 22,
  WAKE_GESTURE: 23,
  GLANCE_GESTURE: 24,
  PICK_UP_GESTURE: 25
};

/**
 *
 */
class SensorsMonitor extends events.EventEmitter {
  constructor() {
    super();
    this._ready = false;
    this._init();
  }

  _restart(why) {
    if (this._socket) {
      this._ready = false;
      this._socket = null;

      log.info(`sensors restart: ${why}`);
      util.timeout(1000)
      .then(() => this._init());
      return;
    }
    log.info(`sensors restart pending (ignored "${why}")`);
  }

  _init() {
    log.verbose(`connecting to ${SENSORS_SOCKET_NAME} socket`);
    this._socket = net.createConnection(SENSORS_SOCKET_NAME, () => {
      log.verbose(`connected to ${SENSORS_SOCKET_NAME} socket`);
      this._buffer = '';
      this._ready = true;
      this.command('ready');
    });
    this._socket.on('data', data => this._onData(data));
    this._socket.on('error', err => {
      this._restart(`sensors error, reason=${err}`);
    });
    this._socket.on('close', hadError => {
      if (!hadError) {
        this._restart(`sensors close`);
      }
    });
  }

  _onData(data) {
    log.verbose(`received data: ${data.toString()}`);
    this._buffer += data.toString();

    let nullByte;
    while ((nullByte = this._buffer.indexOf('\0')) !== -1) {
      let line = this._buffer.substring(0, nullByte);
      this._buffer = this._buffer.substring(nullByte + 1);

      let found;
      if ((found = line.match(/^([\d]*) (.*)/))) {
        line = found[2];
      }

      if ((found = line.match(/^initialized$/))) {
        this.emit('initialized');
      } else if ((found = line.match(/^activated$/))) {
        this.emit('activated');
      } else if ((found = line.match(/^deactivated$/))) {
        this.emit('deactivated');
      } else if ((found = line.match(/^error$/))) {
        this.emit('error');
      } else if ((found = line.match(/^data (.*) (.*)/))) {
        let sensorType = parseInt(found[1]);
        line = found[2];

        switch(sensorType) {
          case SENSOR_TYPE.LIGHT:
          case SENSOR_TYPE.PRESSURE:
          case SENSOR_TYPE.TEMPERATURE:
          case SENSOR_TYPE.PROXIMITY:
          case SENSOR_TYPE.RELATIVE_HUMIDITY:
          case SENSOR_TYPE.AMBIENT_TEMPERATURE:
            this.emit('data', sensorType, parseFloat(found[2]));
            break;
          case SENSOR_TYPE.ACCELEROMETER:
          case SENSOR_TYPE.MAGNETIC_FIELD:
          case SENSOR_TYPE.ORIENTATION:
          case SENSOR_TYPE.GYROSCOPE:
          case SENSOR_TYPE.GRAVITY:
          case SENSOR_TYPE.LINEAR_ACCELERATION:
          case SENSOR_TYPE.ROTATION_VECTOR:
          default:
            found = line.match(/^(.*) (.*) (.*)/);
            this.emit('data', sensorType, found[1], found[2], found[3]);
            break;
        }
      } else {
        log.warn(`Error: Unknown sensors command ${line}`);
      }
    }
  }

  command(cmd) {
    if (!this._ready) {
      log.warn(`sensors service not ready, ignoring the command`);
      return;
    }

    // sensors socket expects the command data in the following format
    var event = SENSORS_COMMAND_NAME + ' ' + '\"' + cmd + '\"' + '\0';

    this._socket.write(event);
    log.verbose(`sensors << ${cmd}`);
  }
}

/**
 * This module exposes functionality to activate/deactivate and read sensors
 * data from various sensors avaialble on the device
 */
class Sensors extends events.EventEmitter {
  constructor() {
    super();
    this._pollInterval = null;
  }

  /**
   * Initialize the {@code Sensors} module
   */
  init() {
    this._monitor = new SensorsMonitor();
    return new Promise((resolve, reject) => {
      this._monitor.on('initialized', () => {
        resolve();
      });
      this._monitor.on('error', () => {
        reject(new Error('Failed to initialize sensors hardware'));
      });
    });
  }

  _poll(rate) {
    this._monitor.command('poll');
    this._monitor.on('data', (sensor, data) => {
      this.emit('data', sensor, data);
      if (this._pollInterval) {
        clearTimeout(this._pollInterval);
        this._pollInterval = setTimeout(() => this._poll(rate), rate);
        this._monitor.removeAllListeners('data');
      }
    });
  }

  /**
   * Activates a given sensor
   *
   * @param sensorType string SENSOR_TYPE.* constant
   * @param rate int sensor polling rate in milliseconds
   * @return Promise that resolved when the sensor is activated
   */
  activate(sensorType, rate) {
    this._monitor.command('activate ' + sensorType + ' ' + rate);
    return new Promise((resolve, reject) => {
      this._monitor.on('activated', () => {
        // Start polling
        if (this._pollInterval) {
          clearTimeout(this._pollInterval);
        }
        this._pollInterval = setTimeout(() => this._poll(rate), rate);
        resolve();
      });
      this._monitor.on('error', () => {
        reject(new Error('Failed to activate sensor'));
      });
    });
  }

  /**
   * Dectivates a given sensor
   *
   * @param sensorType string SENSOR_TYPE.* constant
   * @return Promise that resolved when the sensor is deactivated
   */
  deactivate(sensorType) {
    // Stop polling sensor data
    if (this._pollInterval) {
      clearTimeout(this._pollInterval);
      this._pollInterval = null;
    }

    this._monitor.command('deactivate ' + sensorType);
    return new Promise((resolve, reject) => {
      this._monitor.on('deactivated', resolve);
      this._monitor.on('error', () => {
        reject(new Error('Failed to deactivate sensor'));
      });
    });
  }
}

Sensors.prototype.SENSOR_TYPE = SENSOR_TYPE;

let sensors = new Sensors();
module.exports = sensors;
