/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/* eslint-disable no-console */

import os from 'os';

import config from './config';
import createAdb from './adb';
import DotConfig from './dotConfig';
import Account from './account';
import Device from './device';

const DEFAULT_SERVER_URL = 'https://silk-server-master.herokuapp.com';
const CONFIG_FILEPATH = os.homedir() + '/.silk';

let dotConfig;

async function login() {
  let serverUrl = DEFAULT_SERVER_URL;
  if ('serverUrl' in config) {
    serverUrl = config.serverUrl;
  }

  console.log(`Logging into ${serverUrl} with ${config.username} ...`);

  let account = new Account({serverUrl});
  let success = await account.login(config.username, config.password);
  if (success) {
    // persist login token
    await dotConfig.updateConfig(account.accessToken, account.serverUrl,
      account.beaconUUID);

    console.log('Login success');
  } else {
    console.log('Login failure');
  }
}

async function configure() {
  let adb = createAdb(config.deviceSerialNumber);

  let account = new Account({
    serverUrl: dotConfig.serverUrl,
    accessToken: dotConfig.accessToken,
    beaconUUID: dotConfig.beaconUUID
  });
  let device = new Device({serverUrl: dotConfig.serverUrl}, adb);

  console.log(`Configuring device with Wi-Fi network: ${config.ssid} ${config.password} ...`);

  if (config.newDeviceId) {
    // persist new device ID
    await device.pushDeviceId();
  } else {
    // use device id from device
    await device.pullDeviceId();
  }

  if (await device.setupDevice(account, config.deviceName) &&
      await device.updateWifi(config.ssid, config.password)) {
    console.log('Configure success');
  } else {
    console.log('Configure failed');
  }
}

async function logout() {
  console.log(`Logging out of account ...`);
  await dotConfig.deleteConfig();
  console.log(`Logged out of account`);
}

async function main() {
  try {
    dotConfig = new DotConfig(CONFIG_FILEPATH);
    await dotConfig.readConfig();

    let cmds = {
      'login': login,
      'config': configure,
      'logout': logout
    };
    if (config.cmd in cmds) {
      await cmds[config.cmd]();
    } else {
      console.log(`Unsupported command: ${config.cmd}`);
    }
  } catch(err) {
    console.log(`error: ${err}`);
  }
  process.exit(0);
}

main();

