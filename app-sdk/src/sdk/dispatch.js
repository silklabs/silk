/**
 * @flow
 */

import createLog from 'silk-log';

import * as auth from './auth';
import * as clients from './clients';
import * as devices from './devices';
import emitter from './emitter';

import type {SDKStore} from './store';

const log = createLog('app-sdk-dispatch');

const messageHandlers = {
  ...auth.messageHandlers,
  ...clients.messageHandlers,
  ...devices.messageHandlers,
};

export function init(store: SDKStore) {
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
    handler(store, message, emitter);
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

      // Array types gets special treatment.
      if (Array.isArray(message)) {
        const changed = new Set(message);
        for (let msg of oldMessage) {
          changed.delete(msg);
        }
        for (let msg of changed) {
          log.debug('Dispatching outgoing message', msg);
          emitter.postMessage(msg);
        }
        continue;
      }

      // DEVICES gets special treatment.
      if (messageType === 'DEVICES') {
        const oldDevices = oldMessage.devices;
        const {devices} = message;
        if (devices.length === oldDevices.length) {
          for (let i = 0; i < devices.length; i++) {
            const oldDevice = oldDevices[i];
            const device = devices[i];
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
}
