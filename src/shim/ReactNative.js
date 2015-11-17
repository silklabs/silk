
export const NativeModules = {
  BLESocketManager: {
    addBeaconUuid: () => null,
    removeAllBeaconUuids: () => null,
  },
};

// XXX: Nasty hack to load localforage it does not load as a normal
// es6 module sadly with webpack...
require('script!localforage');
export const AsyncStorage = window.localforage;
