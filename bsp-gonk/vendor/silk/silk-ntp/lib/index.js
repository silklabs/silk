/**
 * @private
 * @flow
 */

import * as util from 'silk-sysutils';
import ntpClient from 'external-node-ntp-client';
import { EventEmitter } from 'events';
import wifi from 'silk-wifi';
import createLog from 'silk-log/device';
import version from 'silk-core-version';

const log = createLog('ntp');

/**
 * Silk NTP time service
 *
 * @module silk-ntp
 * @example
 * const ntp = require('silk-ntp').default;
 * const log = require('silk-alog');
 *
 * ntp.on('time', () => log.info('NTP time acquired'));
 */
let emitter = new EventEmitter();
export default emitter;

// Retry every 10 seconds until time is acquired
const NTP_RETRY_DELAY = 10 * 1000;

// Refresh every 24 hours to combat drift
const NTP_REFRESH_DELAY = 24 * 60 * 60 * 1000;

function setSystemDate(date: Date) {
  log.info(`Setting system time to: ${date.toString()}`);

  /**
   * This event is fired when the new time has been acquired
   *
   * @event time
   * @memberof silk-ntp
   * @instance
   */
  util.exec('time_genoff', [date.getTime().toString()])
    .then(() => emitter.emit('time'))
    .catch((err) => log.warn(`Error: unable to set system time: ${err}`));
}

function getNetworkTime() {

  function ntpCallback(err, date: Date) {
    if (err) {
      log.warn(`Error: NTP failed: ${err}`);
      util.timeout(NTP_RETRY_DELAY).then(getNetworkTime);

    } else {
      setSystemDate(date);
      util.timeout(NTP_REFRESH_DELAY).then(getNetworkTime);
    }
  }

  // TODO: This is currently using the default NTP time server.
  //       Make the server to use configurable?
  wifi.online().then(() => {
    log.info(`Retrieving NTP time from ${ntpClient.defaultNtpServer}`);
    ntpClient.getNetworkTime(undefined, undefined, ntpCallback);
  });
}

// Ensure the device time is newer than the build time of this software.
// In particular this helps avoid device times that are clearly wrong (1969)
// from causing certificates to be considered invalid, etc.
let buildTime = parseInt(version.buildtime, 10);
if (Date.now() < buildTime) {
  log.warn(`Device time is certainly in the past, adjusting to build time`);
  let date = new Date();
  date.setTime(buildTime);
  setSystemDate(date);
}

getNetworkTime();
