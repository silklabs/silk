/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import CmdArgParser from './cmdArgParser';

let parser = new CmdArgParser();

// ----------------------------------------------------------------------------
// Help
// ----------------------------------------------------------------------------
parser.newCmd('help', {
  optionalPositionalArgs: ['command'],
  helpText:
`usage: silk <command> [<command specific args>]

Silk Commands:

  help <cmd> - print this help
  create     - create a new account
  login      - log into account
  logout     - log out of account
  config     - register device with server and configure Wi-Fi network
  unconfig   - unconfigure the device (locally)
  remove     - unregister device from account`,
});

// ----------------------------------------------------------------------------
// Create
// ----------------------------------------------------------------------------
parser.newCmd('create', {
  optionalArgs: { 'u': ['serverUrl', 'string'] },
  positionalArgs: ['email', 'password'],
  helpText:
`usage: silk create [-u <serverUrl>] <email> <password>

  Creates a new account. Saves login tokens in ~/.silk for subsequent runs.

  Parameters:
    email       - email account to create
    password    - new account password

  Options:
    -u <serverUrl>  - specific server to connect to`,
});

// ----------------------------------------------------------------------------
// Login
// ----------------------------------------------------------------------------
parser.newCmd('login', {
  optionalArgs: { 'u': ['serverUrl', 'string'] },
  positionalArgs: ['email', 'password'],
  helpText:
`usage: silk login [-u <serverUrl>] <email> <password>

  Logs into account. Saves login tokens in ~/.silk for subsequent runs.

  Parameters:
    email       - email account to log into
    password    - account password

  Options:
    -u <serverUrl>  - specific server to connect to`,
});

// ----------------------------------------------------------------------------
// Logout
// ----------------------------------------------------------------------------
parser.newCmd('logout', {
  helpText:
`usage: silk logout

  Logs out of account. Removes token in ~/.silk.`,
});

// ----------------------------------------------------------------------------
// Config
// ----------------------------------------------------------------------------
parser.newCmd('config', {
  optionalArgs: {
    's': ['deviceSerialNumber', 'string'],
    'n': ['newDeviceId', null],
  },
  positionalArgs: ['deviceName', 'ssid', 'password'],
  helpText:
`usage: silk config [-s <deviceSerialNumber>] [-n] <deviceName> <ssid> <password>

  Register device with server and configure Wi-Fi network

  |silk login| must have been ran previously.

  ** Requires |adb shell stop silk; adb shell start silk| to take effect **

  Parameters:
    deviceName  - new name of the device
    ssid        - Wi-Fi network ssid to configure to
    password    - Wi-Fi network password credential

  Options:
    -s <deviceSerialNumber>  - specific device to configure (from adb devices)
    -n                       - set flag to create a new device id`,
});

// ----------------------------------------------------------------------------
// Unconfig
// ----------------------------------------------------------------------------
parser.newCmd('unconfig', {
  optionalArgs: {
    's': ['deviceSerialNumber', 'string'],
  },
  helpText:
`usage: silk unconfig [-s <deviceSerialNumber>]

  Unconfigures the Silk device (locally only, the device is not removed
  from the server).

  |silk login| must have been ran previously.

  ** Requires |adb shell stop silk; adb shell start silk| to take effect **

  Options:
    -s <deviceSerialNumber>  - specific device to configure (from adb devices)`,
});

// ----------------------------------------------------------------------------
// Remove
// ----------------------------------------------------------------------------
parser.newCmd('remove', {
  optionalArgs: {
    's': ['deviceSerialNumber', 'string'],
    'i': ['interactive', 'null'],
  },
  helpText:
`usage: silk remove [-s <deviceSerialNumber>] [-i]

  Unregister device from account. Default to device connected via adb.
  Use options to choose other devices.

  |silk login| must have been ran previously.

  Options:
    -s <deviceSerialNumber>  - specific device to configure (from adb devices)
    -i                       - interactive mode. Remove device from list`,
});


// ----------------------------------------------------------------------------
// Parse args
// ----------------------------------------------------------------------------
let config = parser.parse(process.argv);

export default config;
