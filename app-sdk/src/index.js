import { NativeModules, NativeEventEmitter } from 'react-native';

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
  console.log('Receive message from native', message); // eslint-disable-line no-console
});

eventEmitter.postMessage({type: 'INITIALIZED'});
