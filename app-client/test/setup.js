/* eslint-disable flowtype/require-valid-file-annotation */
const mockRequire = require('mock-require');
const STORAGE = {};
mockRequire('react-native', {
  NativeModules: {
    BLESocketManager: {
      addBeaconUuid(beaconUUID) {},
    },
  },
  AsyncStorage: {
    getItem(key) {
      return Promise.resolve(STORAGE[key]);
    },
    setItem(key, value) {
      STORAGE[key] = value;
      return Promise.resolve();
    },
    removeItem(key) {
      delete STORAGE[key];
      return Promise.resolve();
    },
    mergeItem(key, value) {
      throw new Error('Not implemented');
    },
    clear() {
      throw new Error('Not implemented');
    },
    getAllKeys() {
      throw new Error('Not implemented');
    },
    flushGetRequests() {
      throw new Error('Not implemented');
    },
    multiGet(keys) {
      return Promise.all(keys.map(this.getItem));
    },
    multiSet(keyValuePairs) {
      throw new Error('Not implemented');
    },
    multiRemove(keys) {
      throw new Error('Not implemented');
    },
    multiMerge(keyValuePairs) {
      throw new Error('Not implemented');
    },
  },
});

require('../../pub/babel-run/mocha');
