'use strict';

const log = require('silk-alog');
const Vibrator = require('silk-vibrator').default;
const wifi = require('silk-wifi').default;
const Input = require('silk-input').default;
const util = require('silk-sysutils');

module.exports = {
  init: () => {
    /**
     * Initializing the Wi-Fi module.
     */

    wifi.init()
      .then(() => {
        return wifi.online();
      })
      .then(() => {
        log.info('Wifi initialized successfully');
      })
      .catch((err) => {
        log.error('Failed to initialize wifi', err);
      });

    // Power key handling
    let input = new Input();
    let vib = new Vibrator();
    input.on('down', e => {
      vib.pattern(50);
      switch (e.keyId) {
      case 'power':
        log.warn('Powering down');
        util.setprop('sys.powerctl', 'shutdown');
        break;
      default:
        log.verbose(`Unhandled key: ${JSON.stringify(e)}`);
        break;
      }
    });
  },
};
