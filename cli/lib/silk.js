/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/* eslint-disable no-console */

import os from 'os';
import readline from 'readline';
import eventToPromise from 'event-to-promise';

import args from './args';
import createAdb from './adb';
import DotConfig from './dotConfig';
import Account from './account';
import Device from './device';

const DEFAULT_SERVER_URL = 'https://silk-server-master.herokuapp.com';
const CONFIG_FILEPATH = os.homedir() + '/.silk';

let dotConfig;

function createAccount(isNew) {
  if (isNew) {
    let serverUrl = DEFAULT_SERVER_URL;
    if ('serverUrl' in args) {
      serverUrl = args.serverUrl;
    }
    return new Account({serverUrl});
  } else {
    return new Account({
      serverUrl: dotConfig.serverUrl,
      accessToken: dotConfig.accessToken,
      beaconUUID: dotConfig.beaconUUID,
    });
  }
}

async function create() {
  let account = createAccount(true);

  console.log(`Creating new account into ${account.serverUrl} with ${args.email} ...`);

  let success = await account.createAccount(args.email, args.password);
  console.log(`Account created ${success ? 'success' : 'failed'}`);
}

async function login() {
  let account = createAccount(true);

  console.log(`Logging into ${account.serverUrl} with ${args.email} ...`);

  let success = await account.login(args.email, args.password);
  if (success) {
    // persist login token
    await dotConfig.updateConfig(account.accessToken, account.serverUrl,
      account.beaconUUID);

    console.log('Login success');
  } else {
    console.log('Login failure');
  }
}

async function logout() {
  console.log(`Logging out of account ...`);
  await dotConfig.deleteConfig();
  console.log(`Logged out of account`);
}

async function configure() {
  let adb = createAdb(args.deviceSerialNumber);

  let account = createAccount();
  let device = new Device({serverUrl: dotConfig.serverUrl}, adb);

  console.log(`Configuring device with Wi-Fi network: ${args.ssid} ${args.password} ...`);

  if (args.newDeviceId) {
    // persist new device ID
    await device.pushDeviceId();
  } else {
    // use device id from device
    await device.pullDeviceId();
  }

  let success = await device.setupDevice(account, args.deviceName) &&
      await device.updateWifi(args.ssid, args.password);

  console.log(`Configure ${success ? 'success' : 'failed'}`);
}

async function unconfigure() {
  let adb = createAdb(args.deviceSerialNumber);

  let device = new Device({serverUrl: dotConfig.serverUrl}, adb);

  console.log(`Unconfiguring device`);

  let success = await device.removeConfig();
  console.log(`Unconfigure ${success ? 'success' : 'failed'}`);
}

async function getDeviceFromPrompt(devices) {
  let deviceToken;
  for (let i = 0; i < devices.length; i++) {
    console.log(`  ${i / 10 >= 1 ? '' : ' '}${i}: ` +
        `${devices[i].name} (${devices[i].deviceId})`);
  }

  let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let getDeviceIdx = () => {
    rl.question('Select device: ', deviceIdx => {
      if (deviceIdx < devices.length && deviceIdx >= 0) {
        deviceToken = devices[deviceIdx].publicKey.toString();
        rl.close();
      } else {
        getDeviceIdx();
      }
    });
  };
  getDeviceIdx();

  await eventToPromise(rl, 'close');
  return deviceToken;
}

async function remove() {
  console.log(`Remove device from server ...`);

  let account = createAccount();
  let deviceToken;

  if (args.interactive) {
    let devices = await account.listDevices();
    deviceToken = await getDeviceFromPrompt(devices);
  } else {
    let device = new Device(createAdb(args.deviceSerialNumber));
    deviceToken = device.accessToken.toString();
  }

  if (deviceToken) {
    console.log(`Removing ${deviceToken} ...`);
    let success = await account.unregisterDevice(deviceToken);
    console.log(`Removal ${success ? 'success' : 'failed'}`);
  } else {
    console.log(`Bad deviceToken ${deviceToken}, not removing`);
  }
}


async function main() {
  try {
    dotConfig = new DotConfig(CONFIG_FILEPATH);
    await dotConfig.readConfig();

    let cmds = {
      'create': create,
      'login': login,
      'logout': logout,
      'config': configure,
      'unconfig': unconfigure,
      'remove': remove,
    };
    if (args.cmd in cmds) {
      await cmds[args.cmd]();
    } else {
      throw new Error(`unsupported command: ${args.cmd}`);
    }
  } catch(err) {
    console.error(`error: ${err}`);
    process.exit(1);
  }
  process.exit(0);
}

main();

