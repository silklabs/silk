/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

import EventEmitter from 'events';
import makeLog from '../log';

const log = makeLog('beacon');

// TODO: This should be unique to the user's account and generated during config.
const DEFAULT_UUID = 'e0f3a744-fb2f-46f1-b45a-f2b398f2a424';

// TODO: This needs to be measured and customized for each type of device we
//       ship.
// This is the transmit power measured against a Nexus 4 at 1 meter distance.
const DEFAULT_POWER = -60;

export default class Beacon extends EventEmitter {
  constructor(bleno, major = 0, minor = 0) {
    super();

    this.bleno = bleno;
    this.uuid = DEFAULT_UUID;
    this.measuredPower = DEFAULT_POWER;
    this.state = bleno.state;
    this.major = major;
    this.minor = minor;
    this.enabled = false;

    bleno.on('stateChange', state => {
      log.debug('stateChange: %s', state);
      this.state = state;
      this.adjustBeaconState();
    });

    bleno.on('advertisingStart', error => {
      if (error) {
        log.error('Error starting advertising: %j', error);
      } else {
        log.info('Started advertising');
      }
      this.emit('start', error);
    });

    bleno.on('advertisingStop', () => {
      log.info('Stopped advertising');
      this.emit('stop');
    });
  }

  adjustBeaconState() {
    if (this.state === 'poweredOn' && this.enabled) {
      log.info('Starting advertising %j',
               { uuid: this.uuid,
                 major: this.major,
                 minor: this.minor,
                 measuredPower: this.measuredPower });
      this.bleno.startAdvertisingIBeacon(this.uuid,
                                         this.major,
                                         this.minor,
                                         this.measuredPower);
    } else {
      log.info('Stopping advertising');
      this.bleno.stopAdvertising();
    }
  }

  start() {
    log.debug('start()');
    if (!this.enabled) {
      this.enabled = true;
      this.adjustBeaconState();
    }
  }

  stop() {
    log.debug('stop()');
    if (this.enabled) {
      this.enabled = false;
      this.adjustBeaconState();
    }
  }
}
