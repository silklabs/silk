/**
 * Copyright (c) 2015 Silk Labs, Inc.
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

  help <cmd> - prints this help
  login      - logs into account
  logout     - logs out of account
  config     - configures device with server and Wi-Fi network`
});

// ----------------------------------------------------------------------------
// Login
// ----------------------------------------------------------------------------
parser.newCmd('login', {
  optionalArgs: { 'u' : ['serverUrl', 'string'] },
  positionalArgs: ['username', 'password'],
  helpText:
`usage: silk login [-u <serverUrl>] <username> <password>

  Logs into account using <username> and <password> credentials. Saves login
  tokens in ~/.silk. Subsequent silk commands will use these credentials.

  Optionally specify a specific serverUrl to use.`
});

// ----------------------------------------------------------------------------
// Logout
// ----------------------------------------------------------------------------
parser.newCmd('logout', {
  helpText:
`usage: silk logout

  Logs out of account. Removes token in ~/.silk.`
});

// ----------------------------------------------------------------------------
// Config
// ----------------------------------------------------------------------------
parser.newCmd('config', {
  optionalArgs : {
    's': ['deviceSerialNumber', 'string'],
    'n': ['newDeviceId', null]
  },
  positionalArgs: ['deviceName', 'ssid', 'password'],
  helpText:
`usage: silk config [-s <deviceSerialNumber>] [-n] <deviceName> <ssid> <password>

  Configures the Silk device with the server. Assumes |silk login| called previously
  to log into a specific account and server.

  Parameters:
    deviceName  - new name of the device
    ssid        - Wi-Fi network ssid to configure to
    password    - Wi-Fi network password credential

  Options:
    -s <deviceSerialNumber>  - specific device to configure (from adb devices)
    -n                       - set flag to create a new device id`
});

// ----------------------------------------------------------------------------
// Parse args
// ----------------------------------------------------------------------------
let config = parser.parse(process.argv);

export default config;
