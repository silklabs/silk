/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import * as util from './util';
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
  log.info(`Setting system time to: ${date}`);

  // Adjust date by the timezone offset so that date.toISOString() returns local
  // time, as there's no toISOString() equivalent for local time
  let localdate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);

  //
  // TODO: Milliseconds are being dropped below.  This is okay for now because
  // a super accurate time is not required, it just needs to be accurate enough
  // that https certificates will not be considered to be incorrectly expired
  //
  // TODO: One day interfacing with libtime_genoff.so to set the time correctly
  // for the various firmware components (Geolocation/Modem) would be nice.
  // More at https://bugzilla.mozilla.org/show_bug.cgi?id=1110010#c21

  let iso = localdate.toISOString();
  let YYMMDD_HHMMSS = (iso.substring(0, 10) + '.' + iso.substring(11, 19)).replace(/[-:]/g, '');

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
    ntpClient.defaultNtpServer = '104.232.3.3';
    ntpClient.getNetworkTime(undefined, undefined, ntpCallback);
  });
}

getNetworkTime();
module.exports = emitter;
