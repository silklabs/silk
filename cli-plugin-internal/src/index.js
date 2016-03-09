/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/* eslint-disable no-console */

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import eventToPromise from 'event-to-promise';

import createAdb from './adb';
import DotConfig from './dot_config';
import Account from './account';
import Device from './device';

const DEFAULT_SERVER_URL = 'https://silk-server-master.herokuapp.com';
const OLD_CONFIG_FILEPATH = path.join(os.homedir(), '/.silk');
const CONFIG_FILEPATH = path.join(os.homedir(), '/.silk/config.json');
const COMMON_ARGS = {
  serverUrl: [['-u', '--server-url'], {
    help: 'specific server to connect to',
    type: 'string',
    dest: 'serverUrl',
  }],
  deviceSerialNumber: [['-s'], {
    type: 'string',
    help: 'specific device to configure (from adb devices)',
    dest: 'deviceSerialNumber',
    metavar: 'deviceSerialNumber',
  }],
};

// This is a hack for the short term... We want to use ~/.silk as a directory in
// OSS land so if it's a file we move it into ~/.silk as a directory.
{
  // new scope so we don't leak globals...
  let stat;
  try {
    stat = fs.lstatSync(OLD_CONFIG_FILEPATH);
  } catch (err) {
    // eat the error we don't care...
  }

  if (!stat) {
    fs.mkdirSync(OLD_CONFIG_FILEPATH);
  } else if (stat.isFile()) {
    let contents = fs.readFileSync(OLD_CONFIG_FILEPATH);
    fs.unlinkSync(OLD_CONFIG_FILEPATH);
    fs.mkdirSync(OLD_CONFIG_FILEPATH);
    fs.writeFileSync(CONFIG_FILEPATH, contents);
  }
}

let dotConfig = new DotConfig(CONFIG_FILEPATH);

function createAccount(args, isNew) {
  if (isNew) {
    let serverUrl = DEFAULT_SERVER_URL;
    if (args.serverUrl != null) {
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

export let create = {
  help: `
    Creates a new account. Saves login tokens in ~/.silk for subsequent runs.
  `,
  arguments: [
    [['email'], { help: 'email account to create' }],
    [['password'], { help: 'new account password' }],
    COMMON_ARGS.serverUrl,
  ],

  main: async (args) => {
    let account = createAccount(args, true);

    console.log(`Creating new account into ${account.serverUrl} with ${args.email} ...`);

    let success = await account.createAccount(args.email, args.password);
    console.log(`Account created ${success ? 'success' : 'failed'}`);
  }
};

export let login = {
  help: `
    Logs into account. Saves login tokens in ~/.silk for subsequent runs.
  `,
  arguments: [
    [['email'], { help: 'email account to log into' }],
    [['password'], { help: 'account password' }],
    COMMON_ARGS.serverUrl,
  ],

  main: async (args) => {
    let account = createAccount(args, true);

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
};

export let logout = {
  help: `
    Logs out of account. Removes token in ~/.silk.
  `,
  main: async () => {
    console.log(`Logging out of account ...`);
    await dotConfig.deleteConfig();
    console.log(`Logged out of account`);
  }
};

export let configure = {
  help: `
    Register device with server and configure Wi-Fi network

    |silk login| must have been ran previously.

    **Requires |adb shell stop silk; adb shell start silk| to take effect **
  `,
  arguments: [
    [['deviceName'], {
      help: 'new name of the device',
    }],
    [['ssid'], {
      help: 'Wi-Fi network ssid to configure to',
    }],
    [['password'], {
      help: 'Wi-Fi network password credential',
    }],
    COMMON_ARGS.deviceSerialNumber,
    [['-n'], {
      help: 'set flag to create a new device id',
      action: 'storeTrue'
    }]
  ],
  main: async (args) => {
    let adb = createAdb(args.deviceSerialNumber);

    let account = createAccount(args);
    let device = new Device({serverUrl: dotConfig.serverUrl}, adb);

    console.log(`Configuring device with Wi-Fi network: ${args.ssid} ${args.password} ...`);

    if (args.n) {
      // persist new device ID
      await device.pushDeviceId();
    } else {
      // use device id from device
      await device.pullDeviceId();
    }

    let success = await device.setupDevice(account, args.deviceName) &&
        await device.updateWifi(args.ssid, args.password);

    console.log(`Configure ${success ? 'success' : 'failed'}`);
  },
};

export let unconfig = {
  help: `
    Unconfigures the Silk device (locally only, the device is not removed
    from the server).

    |silk login| must have been ran previously.

    ** Requires |adb shell stop silk; adb shell start silk| to take effect **
  `,
  arguments: [
    COMMON_ARGS.deviceSerialNumber
  ],
  main: async (args) => {
    let adb = createAdb(args.deviceSerialNumber);

    let device = new Device({serverUrl: dotConfig.serverUrl}, adb);

    console.log(`Unconfiguring device`);

    let success = await device.removeConfig();
    console.log(`Unconfigure ${success ? 'success' : 'failed'}`);
  },
};

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

export let remove = {
  help: `
    Unregister device from account. Default to device connected via adb.
    Use options to choose other devices.

    |silk login| must have been ran previously.
  `,
  arguments: [
    COMMON_ARGS.deviceSerialNumber,
    [['-i'], {
      dest: 'interactive',
      help: 'interactive mode. Remove device from list',
      action: 'storeTrue',
    }]
  ],
  main: async (args) => {
    console.log(`Remove device from server ...`);

    let account = createAccount(args);
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
};

