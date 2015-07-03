/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let vib = require('./vibrator')();
let movie = require('movie')();
let util = require('./util');
let events = require('events');
let fs = require('fs');

let currentState;
let currentMovieName;

//
// Note: The InputDevice class has been inspired by
// https://github.com/Bornholm/node-keyboard (MIT)
//
class InputDevice extends events.EventEmitter
{
  constructor(dev) {
    super();
    console.log(`InputDevice: ${dev}`);
    this.dev = dev;
    this.bufferSize = 16; // input event size for a 32-bit kernel ONLY
    this.buf = new Buffer(this.bufferSize);
    fs.open(this.dev, 'r', (err, fd) => {
      if (err) {
        console.error(`Unable to open ${dev}`);
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
      console.error(`Unable to read ${this.dev}: ${err}`);
      return;
    }
    //console.log('input_event: ' + buffer.toString('hex'));
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
          console.error(`Unable to enumerate input devices: ${err}`);
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


function uiState(state) {
  if (state === currentState || currentState === 'powerdown') {
    return;
  }
  currentState = state;
  console.log(`ui state: ${currentState}`);

  let movieName = currentState;
  if (currentState === 'connecting') {
    movieName = 'bootanimation';
  }

  if (movieName !== currentMovieName) {
    currentMovieName = movieName;
    try {
      movie.run(`/system/media/${movieName}.movie`);
    } catch (e) {
      console.log(e);
    }

    switch (currentState) {
    case 'online':
      vib.pattern(500, 250, 500);
      break;
    default:
      vib.pattern(500);
      break;
    }
  }
}


// Only monitor input devices event[0-2], these are the devices that report
// volumes/power keys on N4/N6. The other input devices are for headset keys and
// the Input() class currently misbehaves when the headset events are monitored.
let input = new Input(['event0', 'event1', 'event2']);

let cancelPowerDown = () => {};
let volumeKeysPressed = 0;
input.on('up', e => {
  switch(e.keyId) {
  case 'volumeup':
  case 'volumedown':
    volumeKeysPressed--;
    break;
  case 'power':
    cancelPowerDown();
    if (currentState === 'powerdown') {
      util.setprop('sys.powerctl', 'shutdown');
    }
    break;
  default:
    break;
  }
});

input.on('down', e => {
  vib.pattern(50);
  switch(e.keyId) {
  case 'volumeup':
  case 'volumedown':
    volumeKeysPressed++;
    if (volumeKeysPressed === 2) {
      console.log('!! Factory reset !!');
      uiState('powerdown');
      util.exec('librecovery_test', ['factoryReset'])
      .catch(err => {
        console.log(`Factory reset failed: ${err}`);
        // Ouch, now what? Reboot I guess.
        util.setprop('sys.powerctl', 'reboot');
      });
    }
    break;
  case 'power':
    Promise.race([
      util.timeout(1000),
      new Promise((resolve, reject) => cancelPowerDown = reject)
    ])
    .then(() => uiState('powerdown'));
    break;
  default:
    break;
  }
});

module.exports = uiState;
