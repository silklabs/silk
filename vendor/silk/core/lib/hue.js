/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

// This file can be run on device as a normal module, or standalone via |node|
// as a way to register a Hue light bridge connected to the local network.
// Stand alone mode is detected by testing "weOwnTty".
let weOwnTty = (require.main === module);

let hue = require('node-hue-api');
let log = require('./log')('hue');
let util = require('./util');

class LightsHue {
  constructor(user = '28f60800e16636f125ebc50201d5b5f') {
    this.user = user;
    this.bridge = null;
    this.api = null;
    this.lights = [];
    // We kick off light configuration at constructor() time.  This
    // initPromise guards usage of the APIs below; if a user calls us
    // before we're configured, we simply stick the deferred operation
    // onto the end of this initPromise chain.  See |_applyHueState()|
    // below for an example of this technique.
    log.info('Searching for bridges');
    this.initPromise = hue.nupnpSearch().then(bridges => {
      log.info('Found ' + bridges.length + ' bridge(s)');
      if (bridges.length === 0) {
        return Promise.reject('Hue bridge not found');
      }
      this.bridge = bridges[0];
      log.info(`IP address of first bridge: ${this.bridge.ipaddress}`);
      this.api = new hue.HueApi(this.bridge.ipaddress, this.user);
      return this.api.config();
    }).then(config => {
      let userIsRegistered = ('whitelist' in config);
      if (!userIsRegistered && !weOwnTty) {
        log.warn('ERROR: hub not configured for user ' + this.user);
        log.warn('ERROR:   To configure the hub, run this file directly');
        log.warn('ERROR:   on your host machine, for example as:');
        log.warn('ERROR:   $ node dist/lib/hue.js');
        return Promise.reject('Hub not configured');
      }
      let registrationPromise = (userIsRegistered ?
                                 Promise.resolve() : this._register());
      return registrationPromise
      .then(() => this.api.lights())
      .catch(err => Promise.reject(err));
    }).then(result => {
      this.lights = result.lights;
      log.info('Found ' + this.lights.length + ' attached lights');
      this.initPromise = null;
    })
    .catch(err => {
      log.info('Error initializing LightsHue:', err);
      throw err;
    });
  }

  _register() {
    log.info('\n\n  *****  Please press and hold the "Link" button on the bridge!\n\n\n');
    return new Promise((resolve, reject) => {
      return this.api.registerUser(this.bridge.ipaddress,
                                   this.user, 'Test user')
      .then(() => {
        log.info('Created user');
        return this.api.config();
      }).then(() => resolve())
      .catch(err => reject(err));
    });
  }

  _applyHueState(state) {
    if (this.initPromise) {
      return this.initPromise.then(() => this._applyHueState(state));
    }
    let promises = this.lights.map(light =>
                                   this.api.setLightState(light.id, state));
    return Promise.all(promises);

  }

  off() {
    return this._applyHueState(hue.lightState.create().off());
  }

  setState(state) {
    return state.on ? this.setWhite(0.5/*medium warm/cool*/,
                                    state.intensity) : this.off();
  }

  setWhite(warmness, intensity) {
    return this._applyHueState(hue.lightState.create()
                               .on().white(154 + warmness * (500 - 154),
                                           100 * intensity));
  }
}

module.exports = () => new LightsHue();

if (weOwnTty) {
  let lights = new LightsHue();
  lights.setWhite(0.0, 0.1)
  .then(() => {
    log.info('Updated light state to (cool, 10%).');
    return util.timeout(2000);
  })
  .then(() => lights.setWhite(1.0, 0.5))
  .then(() => {
    log.info('Updated light state to (warm, 50%).');
    return util.timeout(2000);
  })
  .then(() => lights.setWhite(0.5, 1.0))
  .then(() => {
    log.info('Updated light state to (mid, 100%).');
  });
}
