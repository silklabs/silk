/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

module.exports = {
  config: require('./config'),
//  crypto: require('./crypto'),
  id: require('./id'),
  // These are the components of the service protocol that must be
  // agreed upon by central and peripheral nodes.
  btleConfigService: {
    state: {
      UNREGISTERED: 0,
      REGISTERING: 1,
      REGISTERED: 2,
      ERROR: 3
    },
    uuid: {
      ConfigService: 'beef',
      StateCharacteristic: '259a43754b8748548ef386be0f6faa68',
      RssiCharacteristic: '803ce13fa50f4370a7e7af45a78788b8',
      CurveCharacteristic: 'b3615a405497431fbf71e7949ff3ad2c',
      PeripheralKeyCharacteristic: 'cebebab40e874de988b4cacaa0af6dfb',
      CentralKeyCharacteristic: '6e1de318302b4e90b0d4232b8cda3c67',
      AccessPointCharacteristic: '8e3ea52bbcbf40d18fdcb40d45dcdd3e',
      SecretCharacteristic: 'cb6def342d794d12886351b17fea3bf1',
      ErrorDescriptionCharacteristic: '47be732080e44d29913dfc9083d2eba3',
      VibratePatternCharacteristic: '385a2b58191211e5b60b1697f925ec7b',
    }
  },

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

};

if (typeof window === 'object') {
  window.silk = module.exports; //eslint-disable-line no-undef
}
