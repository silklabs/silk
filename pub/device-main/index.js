// @flow
'use strict';

const path = require('path');
const log = require('silk-alog');
const wifi = require('silk-wifi').default;
const util = require('silk-sysutils');
const Battery = require('silk-battery').default;
const Movie = require('silk-movie').Movie;
const Vibrator = require('silk-vibrator').default;
const ntp = require('silk-ntp').default;
const Input = require('silk-input').default;
const lights = require('silk-lights');
const Camera = require('silk-camera').default;

function bail(reason, err) {
  log.error('Exiting process due to ' + reason);
  log.error(err.stack || err);
  process.abort();
}

['unhandledRejection', 'uncaughtException'].forEach(reason => {
  process.on(reason, err => bail(reason, err));
});

const productName = util.getstrprop('ro.product.name', '(unknown?)');
log.info('Running on a ' + productName);

// Shutdown the device if running out of power so as to not completely drain
// the battery
const battery = new Battery();
battery.init()
.then(() => {
  battery.on('out-of-power', () => {
    log.warn('Device ran out of power; shutting down...');
    shutdown();
  });
});

// Display something on the screen (if there is one)
let splash = new Movie();
splash.run(path.join(__dirname, 'splash.zip'), () => undefined);

let vib = new Vibrator();
vib.pattern(500);

// Wifi initialization
log.info('Initializing wifi');
wifi.init()
.then(() => {
  return wifi.online();
})
.then(() => {
  log.info('Wifi initialized successfully');
  vib.pattern(500, 250, 500);
})
.catch((err) => {
  log.error('Failed to initialize', err.stack || err);
});

ntp.on('time', () => log.verbose('NTP time acquired'));

// Power key handling
let input = new Input();
input.on('down', e => {
  vib.pattern(100);
  switch (e.keyId) {
  case 'power':
    log.info('Power key pressed, powering down');
    shutdown();
    break;
  default:
    log.verbose(`Unhandled key: ${JSON.stringify(e)}`);
    break;
  }
});

// Keep the backlight on
let backlight = lights.backlight;
backlight.set(backlight.WHITE);

// Shutdown the device
function shutdown() {
  splash.hide();
  util.setprop('sys.powerctl', 'shutdown');
}

let camera = new Camera();
camera.init()
.then(() => {
   camera.startRecording();
});
camera.on('frame', (when, image) => {
  log.info('Received a frame at timestamp', when, '-', image);
});

