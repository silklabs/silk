import { NativeModules } from 'react-native';
import { configureLog } from 'silk-log';
import Config from './config';

/**
 * Configure debug prior to entrypoint so it is ready for other modules.
 */
configureLog(Config.getDefault().debug);

/**
 * Collection of browser shims to make various JS libraries happy.
 */
// socket.io does some detection based on userAgent for ios/gecko so we assign a
// dummy string which nobody cares about.
if (!('userAgent' in navigator)) {  //eslint-disable-line
  navigator.userAgent = 'react-native';  //eslint-disable-line
} else {
  // We're in a browser environment, e.g. Chrome, for debugging
  // purposes. Spin the JS event loop along. This is not necessary
  // when running the JS in-process.
  if (__DEV__) {
    let tick = () => requestAnimationFrame(tick); //eslint-disable-line
    tick();
  }
}

// XXX: Hack to make debug module happy.
if (typeof global.document === 'undefined') {
  global.document = {
    documentElement: {
      style: {},
    },
  };
}

/**
 * Monkey-patch a new method onto WebSocket objects that enables
 * native blob storage for that socket, rather than channeling blobs
 * from native to JS via base64.
 */
global.WebSocket.prototype.enableBlobStorage = function () {
  NativeModules.WebSocketModule.enableBlobStorage(this._socketId);
};
