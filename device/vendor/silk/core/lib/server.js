/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import api from './api';
import events from 'events';
import createLog from './log';
import * as VideoMetrics from './metrics/video';

import type { Socket } from 'silk-socket.io-client-node';

const log = createLog('server');

type ServerAckType = 'diag' | 'info' | 'jpeg' | 'mp4';
type ServerAcks = {[key: ServerAckType]: number};
type ServerState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

/**
 * Server socket.io connection
 */
export default class Server extends events.EventEmitter {
  socket: ?Socket;
  pendingAcks: ServerAcks;
  maxPendingAcks: ServerAcks;
  lastEmittedState: ServerState = 'disconnected';

  constructor() {
    super();

    // Number of acks that can be pending before starting to drop messages
    this.maxPendingAcks = {
      diag: 10,
      info: 1,
      jpeg: 4,
      mp4: 2,
    };
    this._resetAcks();
  }

  /**
   * @private
   */
  _resetAcks(): void {
    this.pendingAcks = {
      diag: 0,
      info: 0,
      jpeg: 0,
      mp4: 0,
    };
  }

  get connected(): bool {
    if (!this.socket) {
      return false;
    }
    return this.socket.connected;
  }

  connect() {
    const socket = this.socket;
    if (!socket || !socket.connected) {
      if (this.lastEmittedState !== 'connecting') {
        this.lastEmittedState = 'connecting';
        this.emit('stateChange', 'connecting');
      }
      if (socket) {
        socket.connect();
      } else {
        this._connect();
      }
    }
  }

  /**
   * XXX: The extra wrapping here might be useless since the api does retries.
   * @private
   */
  _connect() {
    let socket = this.socket = api.socketioClient(
      require('silk-socket.io-client-node'),
      'device',
      { forceNew: true }
    );

    socket.on('connect', () => {
      log.info(`server socket connected`);

      if (this.lastEmittedState !== 'connected') {
        this.lastEmittedState = 'connected';
        this.emit('connect');
      }
    });

    socket.on('disconnect', e => {
      log.warn(`server socket disconnect: ${e}`);

      if (this.lastEmittedState !== 'disconnected') {
        this.lastEmittedState = 'disconnected';
        this.emit('disconnect');
      }

      this._resetAcks();

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
        if (this.lastEmittedState !== 'reconnecting') {
          this.lastEmittedState = 'reconnecting';
          this.emit('reconnecting');
        }
        break;
      }
    });

    socket.on('cmd', data => this.emit('cmd', data));

    ['connect_error', 'connect_timeout'].forEach(event => {
      socket.on(event, err => {
        log.warn(`socket ${event}: retrying connection: ${err}`);
        this.socket = null;
        this.connect();
        if (this.lastEmittedState !== 'reconnecting') {
          this.lastEmittedState = 'reconnecting';
          this.emit('reconnecting');
        }
      });
    });

    socket.on('error', err => {
      log.warn(`socket error: ${err}`);
      this.emit('error', err);
    });


    // add 'error' listener in case no one else is, else node throws exception
    this.on('error', () => {});

    socket.open();
  }

  disconnect() {
    let socket = this.socket;
    if (socket) {
      log.warn('Disconnecting from server');
      socket.disconnect();
    }
  }

  /**
   * Note to AV pipeline diag clients that event `what` happened for
   * object `id` at timestamp `whenMs`.
   * @private
   */
  _meter(what: string, id: string, whenMs: number = Date.now()) {
    this.send('diag', {
      type: 'avpipeline',
      log: { id, what, whenMs },
    });
  }

  /**
   * Send a socket.io message.
   *
   * @param event Name of the event to send
   * @param data Event payload.
   */
  send(event: string, data: any) {
    // TODO: Validate message payload using common module for device, server, app.
    let str = event;
    let ackType: ServerAckType;
    switch (event) {
    case 'info':
      str += ` logo:${data.logo ? 'yes' : 'no'}` +
             ` previewSize:${JSON.stringify(data.previewSize)}`;
      ackType = 'info';
      break;
    case 'video':
      ackType = data.contents;
      switch (data.contents) {
      case 'mp4':
      case 'jpeg':
        break;
      default:
        log.error('Unknown video subtype', data.type);
        return;
      }
      str += `/${data.contents} size:${data.frame ? data.frame.length : 0}` +
            `when:${data.when}ms`;
      if (data.durationMs) {
        str += ` durationMs:${data.durationMs}`;
      }
      str += ` lag:${Date.now() - data.when}ms ` +
             ` objects:${(data.objects ? data.objects.length : 0)}`;
      break;
    case 'diag':
      ackType = 'diag';
      str += `/${data.type}`;
      break;
    default:
      log.error('Unknown event type', event);
      return;
    }
    invariant(ackType !== undefined);

    let wouldTransmit = this.connected;
    let willTransmit = wouldTransmit;
    if (willTransmit) {
      if (this.pendingAcks[ackType] >= this.maxPendingAcks[ackType]) {
        log.warn(`Too many pending acks for ${ackType}`);
        willTransmit = false;
      }
    }
    str = str + ` acks:${this.pendingAcks[ackType]}`;

    if (willTransmit) {
      log.verbose(str);
      const queued = Date.now();
      data.deviceEmitMs = queued;
      invariant(this.socket);
      this.socket.emit(
        event,
        data,
        () => {
          this.pendingAcks[ackType] -= 1;
          if (this.pendingAcks[ackType] < 0) {
            throw new Error(`pending acks for ${ackType} < 0`);
          }
          const networkDuration = Date.now() - queued;
          log.info(`ack in ${networkDuration}ms for ${str}`);
          api.metrics.add(new VideoMetrics.Network(networkDuration));
        }
      );
      this.pendingAcks[ackType] += 1;
    } else {
      log.verbose(`dropped ${str}`);
      if (wouldTransmit && event === 'video' && data.contents === 'mp4') {
        // In the normal success case, the app meters the `record*`
        // events below.  But for dropped segments, we have to meter
        // these from device.
        //
        // TODO: should we always meter these record events from the
        // device side?
        let segmentId = '' + data.when;
        this._meter('recordStart', segmentId, data.when);
        this._meter('recordEnd', segmentId, data.when + data.durationMs);
        // Note to clients that the device decided to drop this
        // segment.
        this._meter('deviceDrop', segmentId);
        api.metrics.add(new VideoMetrics.Dropped());
      }
    }
  }
}
