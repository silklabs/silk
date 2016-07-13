import { NativeModules, NativeEventEmitter } from 'react-native';
import createLog from 'silk-log';

const log = createLog('app-sdk');

class SilkAppSDKEventEmitter extends NativeEventEmitter {

  constructor() {
    super(NativeModules.SLKAppSDKEventEmitter);
  }

  postMessage(message) {
    NativeModules.SLKAppSDKEventEmitter.postMessage(message);
  }

}

const eventEmitter = new SilkAppSDKEventEmitter();

eventEmitter.addListener('silkAppSDKMessage', (message) => {
  if (!message) {
    log.error('Invalid message payload', message);
    return;
  }
  log.error('Received unknown message from native', message);
  eventEmitter.postMessage({
    type: 'MESSAGE_ERROR',
    reason: 'INVALID_MESSAGE_TYPE',
    message,
  });
});

eventEmitter.postMessage({type: 'INITIALIZED'});
