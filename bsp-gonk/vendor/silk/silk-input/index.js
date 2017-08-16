/**
 * @flow
 * @private
 */

import invariant from 'assert';
import events from 'events';
import createLog from 'silk-log';
import fs from 'fs';
import * as util from 'silk-sysutils';
const log = createLog('input');

/**
 * Key input event
 *
 * @name InputEventKey
 * @typedef {Object} InputEventKey
 *
 * @property {string} type 'up', 'down', or 'repeat'
 * @property {number} keyCode Keyboard code
 * @property {string} keyId String key id
 * @property {number} timeS Timestamp (Seconds part)
 * @property {number} timeMS  Timestamp (Microseconds part)
 * @memberof silk-input
 */
export type InputEventKey = {
  type: 'keyup' | 'keydown' | 'keyrepeat';
  timeS: number;
  timeMS: number;
  keyCode: number;
  keyId: string;
};

const keyCodeToId = {
  '113': 'mute',
  '114': 'volumedown',
  '115': 'volumeup',
  '116': 'power',
  '224': 'brightnessdown',
  '225': 'brightnessup',
  '330': 'touch',
};

/**
 * Miscellaneous input event
 *
 * @name InputEventMisc
 * @typedef {Object} InputEventMisc
 *
 * @property {string} type misc
 * @property {number} value miscellaneous value
 * @property {number} timeS Timestamp (Seconds part)
 * @property {number} timeMS  Timestamp (Microseconds part)
 * @memberof silk-input
 */
export type InputEventMisc = {
  type: 'misc',
  value: number;
  timeS: number;
  timeMS: number;
};

export type InputEvent = InputEventKey | InputEventMisc;

//
// Note: The InputDevice class has been inspired by
// https://github.com/Bornholm/node-keyboard (MIT)
//
class InputDevice extends events.EventEmitter {
  buf: Buffer;
  bufferSize: number;
  dev: string;
  fd: number;
  event: ?InputEvent;

  constructor(dev: string) {
    super();
    log.info(`InputDevice: ${dev}`);
    this.dev = dev;
    this.bufferSize = 16; // input event size for a 32-bit kernel ONLY
    this.buf = new Buffer(this.bufferSize);
    fs.open(this.dev, 'r', 0, (err, fd) => {
      if (err) {
        log.warn(`Unable to open ${dev}`);
        return;
      }
      this.fd = fd;
      this._read();
    });
  }

  _read() {
    fs.read(this.fd, this.buf, 0, this.bufferSize, null, this._onRead);
  }

  _onRead = (err, bytesRead, buffer) => {
    if (err) {
      log.warn(`Unable to read ${this.dev}: ${err.toString()}`);
      return;
    }
    invariant(bytesRead === this.bufferSize);
    let [timeS, timeMS, eventType, eventCode, eventValue] = [
      buffer.readUInt32LE(0),
      buffer.readUInt32LE(4),
      buffer.readUInt16LE(8),
      buffer.readUInt16LE(10),
      buffer.readUInt16LE(12),
    ];

    switch (eventType) {
    case 0 /*EV_SYN*/:
    {
      const event = this.event;
      this.event = null;
      if (event) {
        log.debug('Input event:', event);
        this.emit(event.type, event);
      }
      break;
    }
    case 1 /*EV_KEY*/:
      this.event = {
        type: ['keyup', 'keydown', 'keyrepeat'][eventValue],
        timeS,
        timeMS,
        keyCode: eventCode,
        keyId: 'unknown',
      };
      if (keyCodeToId[this.event.keyCode]) {
        this.event.keyId = keyCodeToId[this.event.keyCode];
      }
      break;

    case 3 /*EV_ABS*/:
      switch (eventCode) {
      case 0x28 /*ABS_MISC*/:
        this.event = {
          type: 'misc',
          timeS,
          timeMS,
          value: eventValue,
        };
        break;

      default:
        break;
      }
      break;

    default:
      break;
    }

    this._read();
  }
}

let inputDevices = {};

/**
 * Silk Input
 *
 * @module silk-input
 * @example
 * 'use strict';
 *
 * const Input = require('silk-input').default;
 * const log = require('silk-alog');
 *
 * let input = new Input();
 * input.on('down', e => log.info('Key down event', JSON.stringify(e)));
 * input.on('up', e => log.info('Key up event', JSON.stringify(e)));
 */
export default class Input extends events.EventEmitter {
  _inputDevices: ?Array<InputDevice>;

  constructor() {
    super();

    const deviceList = util.getstrprop('ro.silk.ui.inputevents', '');
    if (deviceList.length > 0) {
      this._open(deviceList.split(','));
    } else {
      fs.readdir('/dev/input', (err, availDevices) => {
        if (err) {
          log.warn(`Unable to enumerate input devices: ${err.toString()}`);
          return;
        }
        this._open(availDevices.filter((i) => i.substring(0, 5) === 'event'));
      });
    }
  }

  _open(devices: Array<string>) {
    this._inputDevices = devices.map((device) => {
      const devicePath = `/dev/input/${device}`;
      let d;
      d = inputDevices[devicePath];
      if (!d) {
        d = new InputDevice(devicePath);
        inputDevices[devicePath] = d;
      }

      /**
       * This event is emitted when a key is released
       *
       * @event up
       * @memberof silk-input
       * @instance
       * @property {InputEventKey} e
       */
      d.on('keyup', (e) => this.emit('up', e));

      /**
       * This event is emitted when a key is pressed
       *
       * @event down
       * @memberof silk-input
       * @instance
       * @property {InputEventKey} e
       */
      d.on('keydown', (e) => this.emit('down', e));

      /**
       * This event is emitted when key is pressed and held down
       *
       * @event repeat
       * @memberof silk-input
       * @instance
       * @property {InputEventKey} e
       */
      d.on('keyrepeat', (e) => this.emit('repeat', e));

      /**
       * This event is emitted on a miscellaneous input
       *
       * @event misc
       * @memberof silk-input
       * @instance
       * @property {InputEventMisc} e
       */
      d.on('misc', (e) => this.emit('misc', e));

      return d;
    });
  }
}
