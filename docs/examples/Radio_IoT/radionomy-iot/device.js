'use strict';

const log = require('silk-alog');
const Vibrator = require('silk-vibrator').default;
const wifi = require('silk-wifi').default;
const Input = require('silk-input').default;
const util = require('silk-sysutils');
const Battery = require('silk-battery').default;

function bail(err) {
  log.error(err.stack || err);
  process.abort();
}
process.on('unhandledRejection', bail);
process.on('uncaughtException', bail);

module.exports = {
  init: () => {
    /**
     * Shutdown the device if running out of power so as to not completely drain
     * the battery
     */
    const battery = new Battery();
    battery.init();
    battery.on('out-of-power', () => {
      log.warn('Device ran out of power; shutting down...');
      shutdown();
    });

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
