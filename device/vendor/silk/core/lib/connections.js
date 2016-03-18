/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import { EventEmitter } from 'events';

import { answer } from 'silk-rtc';
import createLog from 'silk-log';
import sleep from 'silk-utils/sleep';
import SasCompositeClient from 'silk-azure-storage/src/sas_composite_table';
import WebSocket from 'ws';

import Demux from 'silk-streams/src/demux';
import WebSocketDuplex from 'silk-streams/src/websocket';
import { MessagePackDuplexStream } from 'silk-streams/src/msgpack';

import type { Duplex } from 'stream';
import type { Recipient } from 'silk-rtc/src/index';

import api from './api';

const log = createLog('connections');
const MAX_RECONNECT_SLEEP = 30 * 1000;
const RECONNECT_SLEEP_INTERVAL = 250;

type States = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

export default class Connections extends EventEmitter {

  state: States = 'disconnected';

  _ws: ?WebSocket = null;
  _wsDuplex: ?WebSocketDuplex = null;
  _wsUrl: ?string = null;
  _reconnectSleep: number = 0;
  _reconnectAttempts: number = 0;
  _running: bool = false;
  _serversTable: ?SasCompositeClient;
  _demux: ?Duplex = null;
  _connections: Set<Recipient> = new Set();

  get connected(): bool {
    if (!this._ws) {
      return false;
    }

    return this._ws.readyState === WebSocket.OPEN;
  }

  start(): void {
    if (this._running) {
      return;
    }

    log.info('Connections start');

    // We may need to stop and start this class during reconfigure. Setting up
    // the table on start allows us to get a different SAS token as needed.
    this._serversTable = new SasCompositeClient(async () => {
      try {
        const { sas } = await api.device.getSasForSignaling();
        return sas;
      } catch (err) {
        log.error(`Failed to get SAS tokens to find signaling servers: ${err.stack}`);
        throw err;
      }
    });

    this._running = true;
    this._connect();
  }

  stop() {
    this._running = false;

    if (this._ws) {
      this._ws.close();
      this._wsDuplex = this._demux = this._ws = null;
    }
  }

  send(type: string, event: string, payload: Object) {
    for (let recipient of this._connections) {
      const channel = recipient.channel(type);
      if (channel) {
        invariant(channel);
        channel.emit(event, payload);
      } else {
        log.warn(`Attempted to send on non-existant channel: ${type}`);
      }
    }
  }

  _setState(newState: States): void {
    const previousState = this.state;
    this.state = newState;
    this.emit('stateChange', newState, previousState);
    log.info(`state change - new ${newState}, old ${previousState}`);
  }

  /**
   * Find the most viable signaling server to connect to.
   *
   * TODO: In the future we should pick the most optimal region with the least
   * amount of load.
   */
  async _getSignalingServerUrl(): Promise<string> {
    const table = this._serversTable;
    // TODO: Ideally we query something like any signaling server that has
    // pinged the table service in the last 10min.
    invariant(table);
    const servers = await table.query();

    if (servers.length === 0) {
      // This should result in a human being paged in production.
      throw new Error(`(FATAL) Cannot find any online signaling servers`);
    }

    // TODO: Below logic is sensible for tests and while we deploy on heroku.
    // This logic is not suitable for the case where we have many signaling
    // servers... Ideally we would pick most recent during first reconnect
    // attempt and try others if that fails.

    // Whichever server has started most recently will be on top.
    servers.sort((a, b) => {
      invariant(a.start);
      invariant(b.start);
      return (new Date(b.start)) - (new Date(a.start));
    });

    const server = servers[0];
    invariant(server.host);
    return server.host;
  }

  /**
   * Unlike other reconnects we implement elsewhere the goal here is to retry
   * _forever_ until we can reach a signaling server again.
   *
   * XXX: We could potentially be smarter here by allowing network status to
   * ping us directly ...
   */
  async _reconnect(): Promise<void> {
    this._cleanupListeners();

    // If the .stop call has been made do not reconnect.
    if (!this._running) {
      return;
    }

    log.info(
      `Will attempt a reconnect in: ${this._reconnectSleep} ` +
      `(attempt: ${this._reconnectAttempts})`
    );

    this._setState('reconnecting');
    this.emit('reconnecting');

    await sleep(this._reconnectSleep);

    // Ugly but handles the case where we stopped during the above sleep.
    if (!this._running) {
      return;
    }

    this._reconnectAttempts++;
    this._reconnectSleep = Math.min(
      Math.pow(this._reconnectAttempts, 2) * RECONNECT_SLEEP_INTERVAL,
      MAX_RECONNECT_SLEEP,
    );

    this._connect();
  }

  async _connect(): Promise<void> {
    this._setState('connecting');
    process.nextTick(() => {
      this.emit('connecting');
    });

    const url = this._wsUrl = await this._getSignalingServerUrl();

    // Possible we got a stop already ...
    if (!this._running) {
      return;
    }

    log.info(`Connecting to signaling server: ${url}`);
    const signedUrl = api.signSignalingUrl('device', url);
    const ws = this._ws = new WebSocket(signedUrl);

    ws.on('open', this._onWsOpen);
    ws.on('error', this._onWsError);
    ws.on('close', this._onWsClose);
  }

  _onSignaling: (stream: Duplex) => Promise<void> = async (stream) => {
    log.info(`Got signaling client ...`);
    let recipient;
    try {
      recipient = await answer(new MessagePackDuplexStream(stream));
    } catch (err) {
      log.error(`Failed to signal in webrtc connection: ${err.stack}`);
      return;
    } finally {
      stream.end();
    }

    const onError = (err) => {
      log.error(`Error in signaling client: ${err}`);
      cleanup();
    };

    const onClose = () => {
      log.info(`Closing client...`);
      cleanup();
    };

    const cleanup = () => {
      log.info('Cleaning up connection');
      recipient.removeListener('error', onError);
      recipient.removeListener('close', onClose);
      this._connections.delete(recipient);
    };

    recipient.on('error', onError);
    recipient.on('close', onClose);
    this._connections.add(recipient);
    log.info('Registered a new client.');
    this.emit('connection', recipient);
  };

  _cleanupListeners: () => void = () => {
    // Cleanup any previous websocket listeners ...
    const ws = this._ws;
    const wsDuplex = this._wsDuplex;
    const demux = this._demux;
    this._wsDuplex = this._ws = this._demux = null;

    if (demux) {
      demux.removeListener('data', this._onSignaling);
    }

    if (ws) {
      ws.removeListener('open', this._onWsOpen);
      ws.removeListener('error', this._onWsError);
      ws.removeListener('close', this._onWsClose);
    }

    if (wsDuplex) {
      // Ensure that we end the writable side of our duplex to avoid close
      // before finish errors.
      wsDuplex.end();
      wsDuplex.removeListener('error', this._onWsDuplexError);
    }
  };

  _onWsOpen: () => void = () => {
    if (!this._running) {
      this._ws.terminate();
      return;
    }

    this._setState('connected');
    this.emit('connect');
    if (this._wsUrl) {
      log.info(`Connected to signaling server: ${this._wsUrl}`);
    }
    this._wsDuplex = new WebSocketDuplex(this._ws);
    this._wsDuplex.on('error', this._onWsDuplexError);

    this._demux = new Demux(this._wsDuplex);
    this._wsDuplex.pipe(this._demux);

    this._demux.on('data', this._onSignaling);

    if (this._reconnectAttempts) {
      log.info(`Reconnected after ${this._reconnectAttempts} attempts`);
      // reset reconnect details ...
      this._reconnectAttempts = 0;
      this._reconnectSleep = 0;
    }
  };

  _onWsDuplexError: (err: Error) => void = (err) => {
    // Error after close most likely this was a disconnect which we have handled
    // already ...
    if (this._wsDuplex.readyState > WebSocket.OPEN) {
      return;
    }
    log.info(`Unexpected websocket duplex error: ${err.stack}`);
  };

  _onWsError: (err: Error) => void = (err) => {
    this._setState('disconnected');
    this.emit('disconnect');
    log.error(`Failed to connect to signaling server: ${err.stack}`);
    this._reconnect();
  };

  _onWsClose: (reason: string) => void = (reason) => {
    this._setState('disconnected');
    this.emit('disconnect');
    log.info(`Signaling server has closed ... (${reason})`);
    this._reconnect();
  };


}
