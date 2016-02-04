/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/* eslint-disable no-console */

import createLog from 'silk-log';
import fs from 'fs';

const log = createLog('dot-config');

function loadConfig(configPath) {
  let configs = {};
  if (fs.existsSync(configPath)) {
    try {
      let json = JSON.parse(fs.readFileSync(configPath));
      ['accessToken', 'serverUrl', 'beaconUUID'].map(config => {
        if (json[config]) {
          configs[config] = json[config];
        }
      });
    } catch(err) {
      console.log(`Error parsing ${configPath}, deleting. error: ${err}`);
      fs.unlinkSync(configPath);
    }
  }
  log.debug('read configs', configs);
  return configs;
}

export default class DotConfig {
  constructor(configPath) {
    this._configPath = configPath;
    this._configs = loadConfig(configPath);
  }

  writeConfig() {
    fs.writeFileSync(this._configPath, JSON.stringify(this._configs));
  }

  deleteConfig() {
    try {
      fs.unlinkSync(this._configPath);
    } catch(err) {} // eslint-disable-line no-empty
  }

  updateConfig(accessToken, serverUrl, beaconUUID) {
    this._configs = {accessToken, serverUrl, beaconUUID};
    this.writeConfig();
  }

  get configs() {
    return this._configs;
  }

  get accessToken() {
    return this._configs.accessToken;
  }

  get serverUrl() {
    return this._configs.serverUrl;
  }

  get beaconUUID() {
    return this._configs.beaconUUID;
  }
}

