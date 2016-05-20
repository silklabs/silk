/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 */

import * as util from 'silk-sysutils';
import events from 'events';
import net from 'net';
import createLog from 'silk-log/device';

const log = createLog('sensors');

const SENSORS_SOCKET_NAME = '/dev/socket/sensors';

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
 * This module exposes functionality to activate/deactivate and read sensors
 * data from various sensors available on the device.
 *
 * The sensor data is returned as a JSON object in the following format
 *   sensorType: One of the SENSOR_TYPE.* constants
 *   values: Sensor data as returned by the hardware sensor. The length and
 *           contents of the values array depends on which sensor type is being
 *           monitored.
 */
class Sensors extends events.EventEmitter {
  constructor() {
    super();
    this._ready = false;
    this._active = false;
  }

  /**
   * Initialize the Sensors module
   */
  init() {
    log.verbose(`connecting to ${SENSORS_SOCKET_NAME} socket`);
    this._socket = net.createConnection(SENSORS_SOCKET_NAME, () => {
      log.verbose(`connected to ${SENSORS_SOCKET_NAME} socket`);
      this._buffer = '';
      this._ready = true;
      this._command({cmdName: 'ready'});
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

  /**
   * Activate a given sensor
   *
   * @param {number} sensorType SENSOR_TYPE.* constant
   * @param {number} rate Sensor polling rate in milliseconds
   */
  activate(sensorType, rate) {
    this._active = true;
    this._command({cmdName: 'activate', sensorType, rate});
  }

  /**
   * Dectivate a given sensor
   *
   * @param {number} sensorType SENSOR_TYPE.* constant
   */
  deactivate(sensorType) {
    this._active = false;
    this._command({cmdName: 'deactivate', sensorType});
  }

  /**
   * @private
   */
  _restart(why) {
    if (this._socket) {
      this._ready = false;
      this._socket = null;

      log.info(`sensors restart: ${why}`);
      util.timeout(1000)
      .then(() => this.init())
      .catch(util.processthrow);
      return;
    }
    log.info(`sensors restart pending (ignored "${why}")`);
  }

  /**
   * @private
   */
  _onData(data) {
    log.debug(`received data: ${data.toString()}`);
    this._buffer += data.toString();

    let nullByte;
    while ((nullByte = this._buffer.indexOf('\0')) !== -1) {
      let line = this._buffer.substring(0, nullByte);
      this._buffer = this._buffer.substring(nullByte + 1);

      let found;
      if ((found = line.match(/^([\d]*) (.*)/))) {
        line = found[2];
      }

      let sensorEvent = JSON.parse(line);
      if (sensorEvent.eventName === 'initialized') {
        this.emit('initialize');
      } else if (sensorEvent.eventName === 'activated') {
        this.emit('activate');
        this._command({cmdName: 'poll'}); // Start polling
      } else if (sensorEvent.eventName === 'deactivated') {
        this.emit('deactivate');
      } else if (sensorEvent.eventName === 'error') {
        log.warn('Received "error" from sensor service');
        //this.emit('error');
      } else if (sensorEvent.eventName === 'data') {
        this.emit('data', sensorEvent);
      } else {
        log.warn(`Error: Unknown sensors command ${line}`);
      }
    }
  }

  /**
   * @private
   */
  _command(cmd) {
    if (!this._ready) {
      log.warn(`sensors service not ready, ignoring the command`);
      return;
    }

    // sensors socket expects the command data in the following format
    const event = JSON.stringify(cmd) + '\0';
    this._socket.write(event);
    log.verbose(`sensors << ${JSON.stringify(cmd)}`);
  }
}

Sensors.prototype.SENSOR_TYPE = SENSOR_TYPE;

let sensors = new Sensors();
module.exports = sensors;
