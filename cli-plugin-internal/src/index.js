/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

/* eslint-disable no-console */

import invariant from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import eventToPromise from 'event-to-promise';

import createAdb from './adb';
import {AdbScanner} from './adb_scanner';
import DotConfig from './dot_config';
import Account from './account';
import Device from './device';
import API from 'silk-sdk/src/api';
import {exec} from 'silk-sysutils';

import type {ListDevicesOutputDevices} from 'silk-api/src/gen/account';

type ArgSpec = [Array<string>, {
  type?: string;
  help?: string;
  dest?: string;
  metavar?: string;
}];

const DEFAULT_SERVER_URL = 'https://silk-server-master.herokuapp.com';
const OLD_CONFIG_FILEPATH = path.join(os.homedir(), '/.silk');
const CONFIG_FILEPATH = path.join(os.homedir(), '/.silk/config.json');
const COMMON_ARGS: {[key: string]: ArgSpec} = {
  serverUrl: [['-u', '--server-url'], {
    help: 'specific server to connect to',
    type: 'string',
    dest: 'serverUrl',
  }],
  deviceSerialNumber: [['-s'], {
    type: 'string',
    help: 'specific device to use (from adb devices)',
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

function createAccount(args: ?{serverUrl: ?string}, isNew: boolean = false): Account {
  if (isNew) {
    let serverUrl = DEFAULT_SERVER_URL;
    if (args && args.serverUrl) {
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

type LoginOrCreateArgs = {
  email: string;
  password: string;
  serverUrl: ?string;
};

export const create = {
  help: `
    Creates a new account. Saves login tokens in ~/.silk for subsequent runs.
  `,
  arguments: [
    [['email'], { help: 'email account to create' }],
    [['password'], { help: 'new account password' }],
    // $FlowFixMe: property `serverUrl`. Missing annotation
    COMMON_ARGS.serverUrl,
  ],

  main: async (args: LoginOrCreateArgs) => {
    let account = createAccount(args, true);

    console.log(`Creating new account into ${String(account.serverUrl)} with ${args.email} ...`);

    let success = await account.createAccount(args.email, args.password);
    console.log(`Account created ${success ? 'success' : 'failed'}`);
  },
};

export const login = {
  help: `
    Logs into account. Saves login tokens in ~/.silk for subsequent runs.
  `,
  arguments: [
    [['email'], { help: 'email account to log into' }],
    [['password'], { help: 'account password' }],
    // $FlowFixMe: property `serverUrl`. Missing annotation
    COMMON_ARGS.serverUrl,
  ],

  main: async (args: LoginOrCreateArgs) => {
    let account = createAccount(args, true);

    console.log(`Logging into ${String(account.serverUrl)} with ${args.email} ...`);

    let success = await account.login(args.email, args.password);
    if (success) {
      // persist login token
      await dotConfig.updateConfig(
        account.accessToken,
        account.serverUrl,
        account.beaconUUID
      );

      console.log('Login success');
    } else {
      console.log('Login failure');
    }
  },
};

export let logout = {
  help: `
    Logs out of account. Removes token in ~/.silk.
  `,
  main: async () => {
    console.log(`Logging out of account ...`);
    await dotConfig.deleteConfig();
    console.log(`Logged out of account`);
  },
};

type ConfigureArgs = {
  deviceName: string;
  ssid: string;
  password: string;
  deviceSerialNumber?: string;
  n: boolean;
};

export const configure = {
  help: `
    Register device with server and configure Wi-Fi network.

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
      help: 'Wi-Fi network password credential (supply empty string for open networks)',
    }],
    // $FlowFixMe: property `deviceSerialNumber`. Missing annotation
    COMMON_ARGS.deviceSerialNumber,
    [['-n'], {
      help: 'set flag to create a new device id',
      action: 'storeTrue',
    }],
  ],
  main: async (args: ConfigureArgs) => {
    let adb = createAdb(args.deviceSerialNumber);

    let account = createAccount();
    let device = new Device({
      serverUrl: dotConfig.serverUrl,
      newAccessToken: args.n,
    }, adb);

    console.log(`Configuring device ...`);

    const {deviceSerialNumber} = args;
    const api = new API({
      device: deviceSerialNumber,
    });

    let success = await device.setupDevice(account, args.deviceName) &&
        await api.setupWifi(args.ssid, args.password);

    console.log(`Configure ${success ? 'success' : 'failed'}`);
  },
};

type UnconfigArgs = {
  deviceSerialNumber?: string;
};

export const unconfig = {
  help: `
    Unconfigures the Silk device (locally only, the device is not removed
    from the server).

    |silk login| must have been ran previously.

    ** Requires |adb shell stop silk; adb shell start silk| to take effect **
  `,
  arguments: [
    // $FlowFixMe: property `deviceSerialNumber`. Missing annotation
    COMMON_ARGS.deviceSerialNumber,
  ],
  main: async (args: UnconfigArgs) => {
    let adb = createAdb(args.deviceSerialNumber);

    let device = new Device({serverUrl: dotConfig.serverUrl}, adb);

    console.log(`Unconfiguring device`);

    let success = await device.removeConfig();
    console.log(`Unconfigure ${success ? 'success' : 'failed'}`);
  },
};

async function getDeviceFromPrompt(
  devices: Array<ListDevicesOutputDevices>
): Promise<string> {
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
      deviceIdx = parseInt(deviceIdx, 10);
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
  invariant(deviceToken);
  return deviceToken;
}

type RemoveArgs = {
  deviceSerialNumber?: string;
  interactive: boolean;
};

export const remove = {
  help: `
    Unregister device from account. Default to device connected via adb.
    Use options to choose other devices.

    |silk login| must have been ran previously.
  `,
  arguments: [
    // $FlowFixMe: property `deviceSerialNumber`. Missing annotation
    COMMON_ARGS.deviceSerialNumber,
    [['-i'], {
      dest: 'interactive',
      help: 'interactive mode. Remove device from list',
      action: 'storeTrue',
    }],
  ],
  main: async (args: RemoveArgs) => {
    console.log(`Remove device from server ...`);

    let account = createAccount();
    let deviceId;

    if (args.interactive) {
      let devices = await account.listDevices();
      deviceId = await getDeviceFromPrompt(devices);
    } else {
      const adb = createAdb(args.deviceSerialNumber);
      const device = new Device({serverUrl: dotConfig.serverUrl}, adb);
      await device.pullDeviceId();
      invariant(device.api.accessToken);
      deviceId = device.api.accessToken.pub;
    }

    if (deviceId) {
      console.log(`Removing ${deviceId} ...`);
      let success = await account.unregisterDevice(deviceId);
      console.log(`Removal ${success ? 'success' : 'failed'}`);
    } else {
      console.log(`Bad deviceToken ${deviceId}, not removing`);
    }
  },
};

export const removeAll = {
  help: `
    Unregister all devices from account.
    |silk login| must have been ran previously.
  `,
  main: async (): Promise<void> => {
    console.log(`Removing all devices from server ...`);

    let account = createAccount();
    let devices = await account.listDevices();

    if (devices.length === 0) {
      console.log(`No devices associated with this account`);
      return;
    }

    for (let i = 0; i < devices.length; i++) {
      let deviceToken = devices[i].publicKey.toString();
      console.log(`Removing ${deviceToken} ...`);
      let success = await account.unregisterDevice(deviceToken);
      console.log(`Removal ${success ? 'success' : 'failed'}`);
    }
  },
};

type AdbScanArgs = {
  deviceSerialNumber?: string;
};

export const adbscan = {
  help: `
    Scans the network for mDNS-based adb services and automatically connects to
    them.
  `,
  arguments: [
    // $FlowFixMe: property `deviceSerialNumber`. Missing annotation
    COMMON_ARGS.deviceSerialNumber,
  ],
  main: async (args: AdbScanArgs) => {
    const {deviceSerialNumber} = args;

    // Start by disconnecting all network adb devices
    await exec('adb', ['disconnect']);

    let scanner = new AdbScanner(deviceSerialNumber);
    scanner.on('found', async (host) => {
      const device = `${host.ip}:${host.port}`;
      await exec('adb', ['connect', device]);
      console.log('Connected to', device);
    });
    scanner.on('lost', async (host) => {
      const device = `${host.ip}:${host.port}`;
      await exec('adb', ['disconnect', device]);
      console.log('Disconnected from', device);
    });
    scanner.start();

    // Wait until the user wants to exit
    let rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`adb network scanner started, press ENTER to exit\n`, () => {
      rl.close();
      process.exit(0);
    });
  },
};
