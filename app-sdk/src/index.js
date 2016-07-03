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

eventEmitter.addListener('message', (message) => {
  console.log('Receive message from native', message);
});

eventEmitter.postMessage({type: 'INITIALIZED'});
