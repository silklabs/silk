/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let util = require('./util');
let ntpClient = require('ntp-client');
let EventEmitter = require('events').EventEmitter;
let log = require('./log')('ntp');
let emitter = new EventEmitter();

// Retry every 10 seconds until time is acquired
const NTP_RETRY_DELAY = 10 * 1000;

// Refresh every 24 hours to combat drift
const NTP_REFRESH_DELAY = 24 * 60 * 60 * 1000;

function setSystemDate(date) {
  log.info(`Setting system time to: ${date}`);

  //
  // TODO: Milliseconds are being dropped below.  This is okay for now because
  // a super accurate time is not required, it just needs to be accurate enough
  // that https certificates will not be considered to be incorrectly expired
  //
  // TODO: One day interfacing with libtime_genoff.so to set the time correctly
  // for the various firmware components (Geolocation/Modem) would be nice.
  // More at https://bugzilla.mozilla.org/show_bug.cgi?id=1110010#c21

  let iso = date.toISOString();
  let YYMMDD_HHMMSS = (iso.substring(0, 10) + '.' + iso.substring(11, 19)).replace(/[-:]/g, '');

  util.exec('date', ['-s', YYMMDD_HHMMSS ])
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
  log.info('Retrieving NTP time');

  function ntpCallback(err, date) {
    if (err) {
      log.warn(`Error: NTP failed: ${err}`);
      util.timeout(NTP_RETRY_DELAY).then(getNetworkTime);
    } else {
      setSystemDate(date);
      util.timeout(NTP_REFRESH_DELAY).then(getNetworkTime);
    }
  }

  // TODO: This is currently using the default NTP time server, make the server
  // to use configurable?
  ntpClient.getNetworkTime(undefined, undefined, ntpCallback);
}

getNetworkTime();
module.exports = emitter;
