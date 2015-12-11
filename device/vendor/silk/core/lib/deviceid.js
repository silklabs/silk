/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * Read or create a new device id. The id will persist across device restarts.
 *
 * Note: This current pattern of storing to disk may not be secure enough for
 * production.
 *
 * @flow
 */

import api from './api';
import fs from 'mz/fs';
import mkdirp from 'mkdirp-promise';
import path from 'path';
import makeLog from './log';

import type { AccessToken } from 'silk-api';

const log = makeLog('deviceid');

// Where the ID export for this device lives.
const ID_DIR = '/data/silk/config/';
const ID_PATH = path.join(ID_DIR, 'id.json');

let deviceId;

export default async function getDeviceId(): Promise<AccessToken> {
  if (deviceId) {
    return deviceId;
  }

  try {
    log.debug(`Attempting to read '${ID_PATH}'`);

    let fileContents = await fs.readFile(ID_PATH, 'utf8');

    log.debug(`'${ID_PATH}' exists and is readable`);

    deviceId = api.id.import(fileContents);
  } catch(e) {
    if (e.code === 'ENOENT') {
      log.debug(`'${ID_PATH}' does not exist`);
    } else {
      log.warn(e);
    }
  }

  let actionMessage;
  if (deviceId) {
    actionMessage = 'Loaded';
  } else {
    let newId = api.id.create();
    log.debug(`Attempting to create '${ID_DIR}'`);
    await mkdirp(ID_DIR);
    log.debug(`Attempting to write '${ID_PATH}'`);
    await fs.writeFile(ID_PATH, newId.export());
    deviceId = newId;

    actionMessage = 'Created';
  }

  log.info(`${actionMessage} deviceId: ${deviceId.toString()}`);

  return deviceId;
}
