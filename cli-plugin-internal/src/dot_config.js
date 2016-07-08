/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

/* eslint-disable no-console */

import createLog from 'silk-log';
import fs from 'fs';

const log = createLog('dot-config');

type Configs = {
  accessToken?: ?{pub: string; priv: ?string};
  serverUrl?: ?string;
  beaconUUID?: ?string;
};

function loadConfig(configPath: string): Configs {
  let configs = {};
  if (fs.existsSync(configPath)) {
    try {
      let json = JSON.parse(fs.readFileSync(configPath, {encoding: 'utf-8'}));
      ['accessToken', 'serverUrl', 'beaconUUID'].map(config => {
        if (json[config]) {
          configs[config] = json[config];
        }
      });
    } catch (err) {
      console.log(`Error parsing ${configPath}, deleting. error: ${err}`);
      fs.unlinkSync(configPath);
    }
  }
  log.debug('read configs', configs);
  return configs;
}

export default class DotConfig {
  _configPath: string;
  _configs: Configs;

  constructor(configPath: string) {
    this._configPath = configPath;
    this._configs = loadConfig(configPath);
  }

  writeConfig() {
    fs.writeFileSync(this._configPath, JSON.stringify(this._configs));
  }

  deleteConfig() {
    try {
      fs.unlinkSync(this._configPath);
    } catch (err) {} // eslint-disable-line no-empty
  }

  updateConfig(
    accessToken: ?{pub: string; priv: ?string},
    serverUrl: ?string,
    beaconUUID: ?string
  ) {
    this._configs = {accessToken, serverUrl, beaconUUID};
    this.writeConfig();
  }

  get configs(): Configs {
    return this._configs;
  }

  get accessToken(): ?{pub: string; priv: ?string} {
    return this._configs.accessToken;
  }

  get serverUrl(): ?string {
    return this._configs.serverUrl;
  }

  get beaconUUID(): ?string {
    return this._configs.beaconUUID;
  }
}

