/**
 * @flow
 * @private
 */

import events from 'events';
import createLog from 'silk-log';
import fs from 'fs';
import * as util from 'silk-sysutils';
const log = createLog('input');

//
// Note: The InputDevice class has been inspired by
// https://github.com/Bornholm/node-keyboard (MIT)
//
class InputDevice extends events.EventEmitter {
  buf: Buffer;
  bufferSize: number;
  dev: string;
  fd: number;

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
    fs.read(this.fd, this.buf, 0, this.bufferSize, null,
      (err, bytesRead, buffer) => this._onRead(err, bytesRead, buffer));
  }

  _onRead(err, bytesRead, buffer) {
    if (err) {
      log.warn(`Unable to read ${this.dev}: ${err.toString()}`);
      return;
    }
    let event;
    if (buffer.readUInt16LE(8) === 1 /*EV_KEY*/ ) {

      /**
       * Key event type
       *
       * @name KeyEventType
       * @typedef {Object} KeyEventType
       *
       * @property {number} timeS Timestamp (Seconds part)
       * @property {number} timeMS  Timestamp (Microseconds part)
       * @property {number} keyCode Keyboard code
       * @property {string} keyId String key id
       * @memberof silk-input
       */
      event = {
        timeS: buffer.readUInt32LE(0),
        timeMS: buffer.readUInt32LE(4),
        keyCode: buffer.readUInt16LE(10),
        keyId: 'unknown',
        type: ['up', 'down', 'repeat'][buffer.readUInt32LE(12)],
      };
      const keys = {
        '113': 'mute',
        '114': 'volumedown',
        '115': 'volumeup',
        '116': 'power',
        '224': 'brightnessdown',
        '225': 'brightnessup',
        '330': 'touch',
      };
      if (keys[event.keyCode]) {
        event.keyId = keys[event.keyCode];
      }
    }

    if (event) {
      log.debug(`input event: ${event.type}, ${event.keyId}`);
      this.emit(event.type, event);
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
        this._open(availDevices.filter(i => i.substring(0, 5) === 'event'));
      });
    }
  }

  _open(devices: Array<string>) {
    this._inputDevices = devices.map(device => {
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
       * @property {KeyEventType} e
       */
      d.on('up', e => this.emit('up', e));

      /**
       * This event is emitted when a key is pressed
       *
       * @event down
       * @memberof silk-input
       * @instance
       * @property {KeyEventType} e
       */
      d.on('down', e => this.emit('down', e));

      /**
       * This event is emitted when key is pressed and held down
       *
       * @event repeat
       * @memberof silk-input
       * @instance
       * @property {KeyEventType} e
       */
      d.on('repeat', e => this.emit('repeat', e));
      return d;
    });
  }
}
