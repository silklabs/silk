/**
 * @flow
 * @private
 */

import EventEmitter from 'events';
import * as net from 'net';
import createLog from 'silk-log/device';
import * as util from 'silk-sysutils';
import invariant from 'assert';

import type {Socket} from 'net';

const log = createLog('sensors');

const SENSORS_SOCKET_NAME = '/dev/socket/sensors';


/**
 * This module exposes functionality to activate/deactivate and read sensors
 * data from various sensors available on the device.
 * @module silk-sensors
 * @example
 * const sensors = require('silk-sensors');
 *
 * sensors.init();
 * sensors.on('initialize', () => {
 *  sensors.activate(sensors.SENSOR_TYPE.LIGHT, 250);
 * });
 * sensors.on('data', (sensorEvent) => {
 *  log.info('Sensor type: ' + sensorEvent.sensorType);
 *  log.info('Sensor values: + sensorEvent.values');
 * });
 */
export class Sensors extends EventEmitter {
  _active: boolean;
  _buffer: string;
  _ready: boolean;
  _socket: ?Socket;

  /**
   * Type of sensors to interact with. For a full list of
   * sensor types please refer to the source code.
   *
   * @property {(ACCELEROMETER|LIGHT|PROXIMITY)} SENSOR_TYPE
   * @memberof silk-sensors
   */
  SENSOR_TYPE = {
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
    PICK_UP_GESTURE: 25,
  };

  constructor() {
    super();
    this._ready = false;
    this._active = false;
  }

  /**
   * Initialize the Sensors module
   * @memberof silk-sensors
   * @instance
   */
  init() {
    log.verbose(`connecting to ${SENSORS_SOCKET_NAME} socket`);
    const socket = this._socket = net.createConnection(SENSORS_SOCKET_NAME, () => {
      log.verbose(`connected to ${SENSORS_SOCKET_NAME} socket`);
      this._buffer = '';
      this._ready = true;
      this._command({cmdName: 'ready'});
    });
    socket.on('data', data => this._onData(data));
    socket.on('error', err => {
      this._restart(`sensors error, reason=${err}`);
    });
    socket.on('close', hadError => {
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
   * @memberof silk-sensors
   * @instance
   */
  activate(sensorType: number, rate: number) {
    this._active = true;
    this._command({cmdName: 'activate', sensorType, rate});
  }

  /**
   * Dectivate a given sensor
   *
   * @param {number} sensorType SENSOR_TYPE.* constant
   * @memberof silk-sensors
   * @instance
   */
  deactivate(sensorType: number) {
    this._active = false;
    this._command({cmdName: 'deactivate', sensorType});
  }

  /**
   * @private
   */
  _restart(why: string) {
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
  _onData(data: Buffer) {
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
        /**
         * This event is emitted when sensor class is initialized and is ready
         * to activate/decativate a sensor
         *
         * @event initialize
         * @memberof silk-sensors
         * @instance
         */
        this.emit('initialize');
      } else if (sensorEvent.eventName === 'activated') {
        this.emit('activate');
        this._command({cmdName: 'poll'}); // Start polling
      } else if (sensorEvent.eventName === 'deactivated') {
        this.emit('deactivate');
      } else if (sensorEvent.eventName === 'error') {
        log.warn('Received "error" from sensor service');
      } else if (sensorEvent.eventName === 'data') {
        /**
         * This event is emitted when sensor data is available.
         *
         * @event data
         * @property {number} sensorType One of the SENSOR_TYPE.* constants
         * @property {*[]} values: Sensor data as returned by the hardware sensor. The length and
         *           contents of the values array depends on which sensor type is being
         *           monitored. Please refer to `hardware/sensors.h` for details.
         * @memberof silk-sensors
         * @instance
         */
        this.emit('data', sensorEvent);
      } else {
        log.warn(`Error: Unknown sensors command ${line}`);
      }
    }
  }

  /**
   * @private
   */
  _command(cmd: Object) {
    if (!this._ready) {
      log.warn(`sensors service not ready, ignoring the command`);
      return;
    }
    // sensors socket expects the command data in the following format
    const event = JSON.stringify(cmd) + '\0';
    invariant(this._socket);
    this._socket.write(event);
    log.verbose(`sensors << ${JSON.stringify(cmd)}`);
  }
}

const sensors = new Sensors();
export default sensors;
