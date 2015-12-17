/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/* eslint-disable no-console */

import createLog from 'log';
import fs from 'mz/fs';

const log = createLog('dot-config');

export default class DotConfig {
  constructor(configPath) {
    this._configPath = configPath;
    this._configs = {};
  }

  async readConfig() {
    if (await fs.exists(this._configPath)) {
      try {
        let json = JSON.parse(await fs.readFile(this._configPath));
        ['accessToken', 'serverUrl', 'beaconUUID'].map(config => {
          if (json[config]) {
            this._configs[config] = json[config];
          }
        });
      } catch(err) {
        console.log(`Error parsing ${this._configPath}, deleting. error: ${err}`);
        await fs.unlink(this._configPath);
      }
    }
    log.debug('read configs', this._configs);
  }

  async writeConfig() {
    await fs.writeFile(this._configPath, JSON.stringify(this._configs));
  }

  async deleteConfig() {
    await fs.unlink(this._configPath);
  }

  async updateConfig(accessToken, serverUrl, beaconUUID) {
    this._configs = {accessToken, serverUrl, beaconUUID};
    await this.writeConfig();
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

