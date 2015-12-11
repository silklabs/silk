/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import * as util from './sysutils';
import ntpClient from 'ntp-client';
import { EventEmitter } from 'events';
import wifi from './wifi';
import createLog from './log';
import version from 'silk-core-version';

const log = createLog('ntp');

let emitter = new EventEmitter();

// Retry every 10 seconds until time is acquired
const NTP_RETRY_DELAY = 10 * 1000;

// Refresh every 24 hours to combat drift
const NTP_REFRESH_DELAY = 24 * 60 * 60 * 1000;

function setSystemDate(date) {
  log.info(`Setting system time to: ${date}`);

  util.exec('time_genoff', [date.getTime()])
  .catch(err => {
    log.warn(`Error: unable to set system time: ${err}`);
  })
  .then(() => {
    emitter.emit('time');
  });
}

function getNetworkTime() {

  function ntpCallback(err, date) {
    if (err) {
      log.warn(`Error: NTP failed: ${err}`);
      util.timeout(NTP_RETRY_DELAY)
      .then(getNetworkTime)
      .catch(util.processthrow);
    } else {
      setSystemDate(date);
      util.timeout(NTP_REFRESH_DELAY)
      .then(getNetworkTime)
      .catch(util.processthrow);
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
if (Date.now() < version.buildtime) {
  log.warn(`Device time is certainly in the past, adjusting to build time`);
  let date = new Date();
  date.setTime(version.buildtime);
  setSystemDate(date);
}

getNetworkTime();
module.exports = emitter;
