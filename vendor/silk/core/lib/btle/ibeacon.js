/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// TODO: rewrite me, and share bluetooth-init logic with scanner

var config = {
  uuid: 'E2C56DB5-DFFB-48D2-B060-D0F5A71096E0',
  major: 0,
  minor: 0,
  measuredPower: -73, // -128 - 127
  enabled: false,
  state: 'poweredOff',
};

var bleno = require('bleno');

function adjustBeaconState() {
  if (config.state === 'unsupported') {
    throw 'ERROR: bluetooth adapter state is "unsupported", which seems to indicate a bleno or bluez bug.  Cowardly exiting.';
  }
  if (config.state === 'poweredOn' && config.enabled) {
    bleno.startAdvertisingIBeacon(config.uuid, config.major, config.minor, config.measuredPower,
                                  function(err) {
                                    if (err) {
                                      console.log('Error: ' + err);
                                    }
                                  });
  } else {
    bleno.stopAdvertising();
  }
}

bleno.on('stateChange', function(state) {
  console.log('bleno: Bluetooth state changed to "' + state + '"');
  config.state = state;
  adjustBeaconState();
});

bleno.on('advertisingStart', function(err) {
  if (err) {
    console.log(err);
    return;
  }
  console.log('Started advertising');
});

function start() {
  config.enabled = true;
  adjustBeaconState();
}

function stop() {
  config.enabled = false;
  adjustBeaconState();
}

module.exports = function(uuid, major, minor, measuredPower) {
  config.uuid = uuid || config.uuid;
  config.major = major || config.major;
  config.minor = minor || config.minor;
  config.measuredPower = measuredPower || config.measuredPower;
  return {
    start: start,
    stop: stop,
  };
};
