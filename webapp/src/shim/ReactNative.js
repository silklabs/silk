import sjcl from 'sjcl';
sjcl.random.startCollectors();

export const NativeModules = {
  BLESocketManager: {
    addBeaconUuid: () => null,
    removeAllBeaconUuids: () => null,
  },
  AppCrypto: {
    getRandomBytes(numberOfBytes, callback) {
      let bytes = new Uint8Array(numberOfBytes);
      window.crypto.getRandomValues(bytes);
      callback(bytes);
    },
    PBKDF2KeyDerivation(input, salt, rounds, callback) {
      let output = sjcl.misc.pbkdf2(input, salt, rounds);
      callback(sjcl.codec.hex.fromBits(output));
    },
  },
};

// XXX: Nasty hack to load localforage it does not load as a normal
// es6 module sadly with webpack...
require('script!localforage');
export const AsyncStorage = window.localforage;
