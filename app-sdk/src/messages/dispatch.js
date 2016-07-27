/**
 * @flow
 */

import createLog from 'silk-log';

import * as actions from '../store/actions';
import * as auth from './auth';
import * as clientStatus from './client_status';
import * as devices from './devices';
import defaultConfig from '../config';
import emitter from './emitter';
import createStore from './store';

const log = createLog('app-sdk-dispatch');

const messageHandlers = {
  ...auth.messageHandlers,
};

export default async function startDispatch() {
  const store = createStore();

  // Handle incoming messages.
  emitter.addListener('silkAppSDKMessage', (message) => {
    // TODO: validate messages against Joi schema

    if (!message || !message.type) {
      log.error('Invalid message payload', message);
      emitter.postMessage({
        type: 'MESSAGE_ERROR',
        error: 'INVALID_MESSAGE_FORMAT',
        message,
      });
      return;
    }

    const handler = messageHandlers[message.type];
    if (!handler) {
      log.error('Received unknown message from native', message);
      emitter.postMessage({
        type: 'MESSAGE_ERROR',
        error: 'INVALID_MESSAGE_TYPE',
        message,
      });
      return;
    }

    log.debug('Dispatching incoming message', message);
    handler(store, message);
  });

  // Handle outgoing messages on state changes.
  store.subscribeToPath('messages', (messages, oldMessages) => {
    // Figure out which message changed and dispatch it.
    for (let messageType in messages) {
      const message = messages[messageType];
      const oldMessage = oldMessages[messageType];
      if (message === oldMessage) {
        continue;
      }
      // DEVICE_LIST gets special treatment.
      if (messageType === 'DEVICE_LIST') {
        const oldDevices = oldMessage.devices;
        const {devices} = message;
        if (devices.length === oldDevices.length) {
          for (let i = 0; i < message.devices; i++) {
            const oldDevice = oldDevices[i];
            const device = device[i];
            if (oldDevice !== device) {
              log.debug('Dispatching outgoing message', device);
              emitter.postMessage(device);
            }
          }
          continue;
        }
      }
      log.debug('Dispatching outgoing message', message);
      emitter.postMessage(message);
    }
  });

  // Startup initialization.
  emitter.postMessage({type: 'INITIALIZED'});
  process.nextTick(() => {
    clientStatus.initialize(store);
    devices.initialize(store);
    store.dispatch(actions.config.setDefault(defaultConfig));
  });
}
