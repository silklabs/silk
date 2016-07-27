/**
 * @flow
 */

import {NativeModules, NativeEventEmitter} from 'react-native';

import type {ClientStatusMessage} from './client_status';
import type {DeviceListMessage, DeviceStatusMessage} from './devices';

type InitializedMessage = {
  type: 'INITIALIZED';
};

type MessageError =
    'NOT_INITIALIZED'
  | 'INVALID_MESSAGE_FORMAT'
  | 'INVALID_MESSAGE_TYPE'
  ;

type MessageErrorMessage = {
  type: 'MESSAGE_ERROR';
  error: MessageError; // TODO: rename to messageError
  message: any;
};

type OutgoingMessage =
    InitializedMessage
  | MessageErrorMessage
  | ClientStatusMessage
  | DeviceListMessage
  | DeviceStatusMessage
  ;

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
