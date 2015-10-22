/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import loadConfig from './config';
import VIP from './vip';
import Account from './gen/account';
import Device from './gen/device';

// XXX Remove once app has been updated to use socket service.
export const btleConfigService = {
  state: {
    UNREGISTERED: 0,
    REGISTERING: 1,
    REGISTERED: 2,
    ERROR: 3
  },
  uuid: {
    Beacon: 'e0f3a744-fb2f-46f1-b45a-f2b398f2a424',
    ConfigService: 'beef',
    StateCharacteristic: '259a43754b8748548ef386be0f6faa68',
    ServerConnectionStatusCharacteristic: '595d664ac5314245a7a89aeae6883cfe',
    RssiCharacteristic: '803ce13fa50f4370a7e7af45a78788b8',
    CurveCharacteristic: 'b3615a405497431fbf71e7949ff3ad2c',
    PeripheralKeyCharacteristic: 'cebebab40e874de988b4cacaa0af6dfb',
    CentralKeyCharacteristic: '6e1de318302b4e90b0d4232b8cda3c67',
    AccessPointCharacteristic: '8e3ea52bbcbf40d18fdcb40d45dcdd3e',
    SecretCharacteristic: 'cb6def342d794d12886351b17fea3bf1',
    DeviceIdCharacteristic: '3f0497ec81b24850a2579237bcf8591a',
    RegistrarPublicKeyCharacteristic: '2dc633ddd4d64429a62b2ac3c8c6831d',
    RegistrationTokenCharacteristic: '7c6825b2514549da837f9e23f0b9497c',
    ErrorDescriptionCharacteristic: '47be732080e44d29913dfc9083d2eba3',
    VibratePatternCharacteristic: '385a2b58191211e5b60b1697f925ec7b',
  }
};

export const BTLE_SOCKET_UUIDS = {
  service: 'e0f3a744-fb2f-46f1-b45a-f2b398f2a424',
  characteristic: '59ba85fb-6fba-439c-95b0-9307e62d4ca1',
};

export default function create(options) {
  const config = loadConfig(options);
  let accessToken = null;
  const services = {
    vip: new VIP(config.serverUrl),
    account: new Account(config.serverUrl),
    device: new Device(config.serverUrl)
  };

  let exports = {
    config: config,
    id: require('./id'),
    // These are the components of the service protocol that must be
    // agreed upon by central and peripheral nodes.
    btleConfigService,

    // Export the developer account
    // TODO: Remove prior to production!
    devAccount: require('./dev_account'),

    // TODO: crypto has been working fine for a long time, but
    // react-native JS environment is unable to load the 'elliptic'
    // module, which otherwise works in both browser and node
    // environments.  Sigh.
    crypto: {
      create: () => {
        return {
          exportPublic: () => 'key',
          deriveShared: () => 'shared',
          encrypt: (text) => Promise.resolve(text),
          decrypt: (text) => text,
        };
      },
    },
    blob: require('./blob')(config),
    timeMeta: require('./time_metadata')(config),
    crashMeta: require('./crash_metadata')(config),
    socketio: require('./socketio')(config),

    set accessToken(token) {
      accessToken = token;
      for (let key in services) {
        // TODO: Rename .key once consumers are using this new way of setting
        // the accessToken.
        //
        // .key = accessToken...
        services[key].key = token;
      }
    },

    get accessToken() {
      return accessToken;
    }
  };

  for (let key in services) {
    exports[key] = services[key];
  }

  return exports;
};
