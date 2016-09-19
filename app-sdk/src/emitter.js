/**
 * @flow
 */

import {NativeModules, NativeEventEmitter} from 'react-native';

import type {OutgoingMessage} from './outgoing';

export class SilkAppSDKEventEmitter extends NativeEventEmitter {

  constructor() {
    super(NativeModules.SLKAppSDKEventEmitter);
  }

  postMessage(message: OutgoingMessage) {
    NativeModules.SLKAppSDKEventEmitter.postMessage(message);
  }

}

const eventEmitter = new SilkAppSDKEventEmitter();
export default eventEmitter;
