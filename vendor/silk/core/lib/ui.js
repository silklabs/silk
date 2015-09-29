/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

let caps = require('./caps');
let events = require('events');
let fs = require('fs');
let lights = require('./lights');
let log = require('./log')('ui');
let util = require('./util');

const FACTORY_RESET_DISABLED = util.getboolprop('persist.silk.ui.reset.disabled');

//
// Note: The InputDevice class has been inspired by
// https://github.com/Bornholm/node-keyboard (MIT)
//
class InputDevice extends events.EventEmitter
{
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
  };

  _onRead(err, bytesRead, buffer) {
    if (err) {
      log.warn(`Unable to read ${this.dev}: ${err}`);
      return;
    }
    let event;
    if (buffer.readUInt16LE(8) === 1 /*EV_KEY*/ ) {
      event = {
        timeS: buffer.readUInt32LE(0),
        timeMS: buffer.readUInt32LE(4),
        keyCode: buffer.readUInt16LE(10),
        type: ['up', 'down', 'repeat'][buffer.readUInt32LE(12)]
      };
      var keys = {
        114: 'volumedown',
        115: 'volumeup',
        116: 'power',
      };
      event.keyId = keys[event.keyCode];
    }

    if (event) {
      this.emit(event.type, event);
    }
    this._read();
  };
}

class Input extends events.EventEmitter
{
  constructor(devices) {
    super();

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
      let d = new InputDevice(`/dev/input/${device}`);
      d.on('up', e => this.emit('up', e));
      d.on('down', e => this.emit('down', e));
      d.on('repeat', e => this.emit('repeat', e));
      return d;
    });
  }
}


class Ui extends events.EventEmitter
{
  constructor() {
    super();

    this.movie = new (require('silk-movie').Movie)();
    this.vib = require('./vibrator')();

    let input;
    if (caps.has('dev-input-hack')) {
      //
      // Only monitor the input devices used for the power and volume keys for these
      // devices (determined by running |adb shell getevent -l| and pressing each
      // key)
      //
      // The way that node/libuv reads from the input devices (blocking read on a
      // separate thread for each input device) differs from how Android does it
      // (poll/read on one thread) and one theory is that this exposes a kernel bug
      // that manifest as:
      //
      // * key events from hard key presses and releases are delayed by multiple
      //   seconds sometimes. Triggering a number of touchscreen events can help get
      //   them unstuck.
      // * DNS resolution can be delayed until some touchscreen events are
      //   triggered - bionic's getaddrinfo() communicates with netd over
      //   /dev/socket/dnsproxyd, which may or may not be related.
      //
      // So still something of a mystery here, more at #144
      //
      switch (util.getprop('ro.boot.hardware')) {
      case 'mako':
        input = new Input(['event0', 'event1']);
        break;
      case 'shamu':
        input = new Input(['event1', 'event2']);
        break;
      default:
        // If/when we need to add a new device to this list, it's probably time to
        // take a close look into what's actually happening here!
        throw 'Unknown device';
      }
    } else {
      input = new Input();
    }

    let cancelPowerDown = () => {};
    let cancelVolumeKeys = () => {};
    let volumeKeysPressed = 0;
    input.on('up', e => {
      this._pokeBacklight();
      switch(e.keyId) {
      case 'volumeup':
      case 'volumedown':
        if (volumeKeysPressed > 0) {
          volumeKeysPressed--;
          cancelVolumeKeys();
        }
        break;
      case 'power':
        cancelPowerDown();
        break;
      default:
        break;
      }
    });

    input.on('down', e => {
      this.vib.pattern(50);
      if (this._pokeBacklight()) {
        // The first key event with the backlight off does nothing but enable
        // the backlight
        return;
      }
      switch(e.keyId) {
      case 'volumeup':
      case 'volumedown':
        volumeKeysPressed++;
        if (volumeKeysPressed === 2) {
          this.emit('key:setup');
          if (FACTORY_RESET_DISABLED) {
            log.verbose('Factory reset disabled');
            break;
          }
          Promise.race([
            util.timeout(1000),
            new Promise((resolve, reject) => cancelVolumeKeys = reject)
          ])
          .then(() => this.emit('key:factoryreset'));
        }
        break;
      case 'power':
        Promise.race([
          util.timeout(1000),
          new Promise((resolve, reject) => cancelPowerDown = reject)
        ])
        .then(() => this.emit('key:powerdown'));
        break;
      default:
        break;
      }
    });
  }

  _pokeBacklight() {
    let off = true;
    let backlight = lights.backlight;

    if (this.backlightTimer) {
      off = false;
      clearTimeout(this.backlightTimer);
    }


    let timeout = 60 * 1000;
    if (this.currentState === 'charging') {
      timeout = 3 * 1000;
    }

    this.backlightTimer = setTimeout(() => {
      log.debug('Backlight timeout');
      backlight.set(backlight.BLACK);
      this.backlightTimer = null;
    }, timeout);
    backlight.set(backlight.WHITE);

    return off; // return true if the backlight was just enabled
  }

  goto(state) {
    if (state === this.currentState || this.currentState === 'powerdown') {
      return false;
    }
    this.currentState = state;
    log.info(`ui state: ${this.currentState}`);

    if (caps.has('notification-light')) {
      let light = lights.notifications;

      switch (this.currentState) {
      case 'bootanimation':
        light.set(light.BLUE, light.FLASH_TIMED, 500, 500);
        break;
      case 'setup':
        light.set(light.YELLOW, light.FLASH_TIMED, 500, 500);
        break;
      case 'connecting':
        light.set(light.GREEN, light.FLASH_TIMED, 2000, 1000);
        break;
      case 'online':
        light.set(light.GREEN);
        break;
      case 'powerdown':
        light.set(light.BLUE, light.FLASH_TIMED, 500, 500);
        break;
      default:
        light.set(light.BLACK);
        break;
      }
    }

    let movieName = this.currentState;
    switch (this.currentState) {
    case 'connecting':
      movieName = 'bootanimation';
      break;
    case 'charging':
      movieName = 'powerdown';
      break;
    default:
      break;
    }

    if (movieName !== this.currentMovieName) {
      this.currentMovieName = movieName;
      try {
        this.movie.run(`/system/silk/media/${movieName}.zip`);
      } catch (e) {
        log.warn(e);
      }

      switch (this.currentState) {
      case 'online':
        this.vib.pattern(500, 250, 500);
        break;
      case 'charging':
        // Don't waste more battery vibrating when in the charging state
        break;
      default:
        this.vib.pattern(500);
        break;
      }
    }
    this._pokeBacklight();
    return true;
  }
}

module.exports = new Ui();
