/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

 /**
  * @flow
  */
import api from './api';
import events from 'events';
import createLog from './log';

import type { Socket } from 'socket.io-client';

const log = createLog('server');

class Server extends events.EventEmitter {
  socket: Socket;
  _fetchRetryTimer: ?number;

  constructor() {
    super();
  }

  get connected(): bool {
    if (this.socket) {
      return this.socket.connected;
    } else {
      return false;
    }
  }

  connect() {
    if (this.socket) {
      if(!this.socket.connected) {
        this.emit('stateChange', 'connecting');
        this.socket.connect();
      }
      return;
    }

    this.emit('stateChange', 'connecting');
    this._connect();
  }

  /**
   * XXX: The extra wrapping here might be useless since the api does retries.
   */
  _connect() {
    this.socket = api.socketioClient(require('silk-socket.io-client-node'), 'device', {
      forceNew: true,
    });
    this.socket.open();

    this.socket.on('connect', () => {
      log.info(`server socket connected`);
      this.emit('connect');
    });

    this.socket.on('disconnect', e => {
      log.warn(`server socket disconnect: ${e}`);
      this.emit('disconnect');

      switch (e) {
      case 'io client disconnect':
        // Device initiated disconnect
        break;
      case 'io server disconnect':
        // When the server disconnects, the socket.io retry logic doesn't kick
        // in. Create a new socket (to ensure a clean slate) and try to connect
        // again.
        this.socket = null;
        this.connect();
        // falls through
      default:
        this.emit('reconnecting');
        break;
      }
    });

    this.socket.on('cmd', data => this.emit('cmd', data));

    let errors = ['connect_error', 'connect_timeout', 'error',
        'reconnect_attempt', 'reconnect_error', 'reconnect_failed',
        'reconnecting'];

    errors.forEach(error => {
      this.socket.on(error, e => {
        log.warn(`socket ${error}: ${e}`);
        this.emit('error', error);
      });
    });

    // add 'error' listener in case no one else is, else node throws exception
    this.on('error', () => {});
  }

  disconnect() {
    clearTimeout(this._fetchRetryTimer);
    this._fetchRetryTimer = null;

    if (this.socket) {
      log.warn('Disconnecting from server');
      this.socket.disconnect();
    }
  }
}

module.exports = new Server();
