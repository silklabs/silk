
import events from 'events';
import createLog from 'silk-log/device';
import fs from 'fs';
import * as util from 'silk-sysutils';
const log = createLog('input');

//
// Note: The InputDevice class has been inspired by
// https://github.com/Bornholm/node-keyboard (MIT)
//
class InputDevice extends events.EventEmitter {
  constructor(dev) {
    super();
    log.info(`InputDevice: ${dev}`);
    this.dev = dev;
    this.bufferSize = 16; // input event size for a 32-bit kernel ONLY
    this.buf = new Buffer(this.bufferSize);
    fs.open(this.dev, 'r', (err, fd) => {
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
      log.warn(`Unable to read ${this.dev}: ${err}`);
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
       * @memberof silk-input
       */
      event = {
        timeS: buffer.readUInt32LE(0),
        timeMS: buffer.readUInt32LE(4),
        keyCode: buffer.readUInt16LE(10),
        type: ['up', 'down', 'repeat'][buffer.readUInt32LE(12)],
      };
      const keys = {
        113: 'mute',
        114: 'volumedown',
        115: 'volumeup',
        116: 'power',
        224: 'brightnessdown',
        225: 'brightnessup',
        330: 'touch',
      };
      event.keyId = keys[event.keyCode];
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
  constructor() {
    super();

    const devices = util.getlistprop('ro.silk.ui.inputevents', null);
    if (devices) {
      this._open(devices);
    } else {
      fs.readdir('/dev/input', (err, availDevices) => {
        if (err) {
          log.warn(`Unable to enumerate input devices: ${err}`);
          return;
        }
        this._open(availDevices.filter(i => i.substring(0, 5) === 'event'));
      });
    }
  }

  _open(devices) {
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
