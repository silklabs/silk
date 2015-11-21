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

const log = createLog('ntp');

let emitter = new EventEmitter();

// Retry every 10 seconds until time is acquired
const NTP_RETRY_DELAY = 10 * 1000;

// Refresh every 24 hours to combat drift
const NTP_REFRESH_DELAY = 24 * 60 * 60 * 1000;

function setSystemDate(date) {
  const timeDeltaMs = date.getTime() - Date.now();

  log.info(`Setting system time to: ${date}`);

  // Adjust date by the timezone offset so that date.toISOString() returns local
  // time, as there's no toISOString() equivalent for local time
  const localdate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);

  //
  // TODO: Milliseconds are being dropped below.  This is okay for now because
  // a super accurate time is not required, it just needs to be accurate enough
  // that https certificates will not be considered to be incorrectly expired

  const iso = localdate.toISOString();
  const YYMMDD_HHMMSS = (iso.substring(0, 10) + '.' + iso.substring(11, 19)).replace(/[-:]/g, '');

  util.exec('date', ['-s', YYMMDD_HHMMSS ]) // date expects local time, not UTC
  .then(
    result => {
      if (result.code !== 0) {
        log.warn(`Error: unable to set system time: ${result.code}: ${result.stderr}`);
      } else {
        emitter.emit('time');
      }
    },
    err => {
      log.warn(`Error: unable to set system time: ${err}`);
    }
  );

  // Some devices use the QC time_daemon to set the system time at boot-up
  // based on an offset from the SoC's RTC clock.  This offset needs to be
  // adjusted to ensure the new time is persisted.
  util.exec('time_genoff', [timeDeltaMs])
  .then(
    result => {
      if (result.code !== 0) {
        log.warn(`time_genoff failed with error: ${result.code}`);
      }
    },
    err => {
      log.error(`unable to exec time_genoff: ${err}`);
    }
  );
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
    log.info('Retrieving NTP time');
    ntpClient.getNetworkTime(undefined, undefined, ntpCallback);
  });
}

getNetworkTime();
module.exports = emitter;
