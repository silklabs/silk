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
import createLog from 'silk-log/device';
import SasCompositeClient from 'silk-azure-storage/src/sas_composite_table';
import WebSocket from 'ws';

import {
  MultiplexStream,
  JSONDuplexStream,
  WebSocketDuplexStream,
} from 'silk-streams';

import type { VirtualStream } from 'silk-streams/src/demux';

import type {
  ErrorEventCb,
  CloseEventCb,
} from 'ws';

import type { Peer, StructuredDataChannel, UserMediaConstraints } from 'silk-rtc';

import api from 'silk-device-api';

const log = createLog('connections');
const MAX_RECONNECT_SLEEP = 30 * 1000;
const RECONNECT_SLEEP_INTERVAL = 250;

export type ConnectionsState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';


export class ChannelEventEmitter extends EventEmitter {
  _label: string;
  _connections: Connections;
  _open: bool = false;

  maxBufferedAmount: number = Infinity;

  constructor(label: string, connections: Connections) {
    super();
    this._label = label;
    this._connections = connections;
    this.on('newListener', this._newListener);
    // NOTE: Explicitly not bothering to register for 'removeListener' to clean
    //       up the channel.on() registrations right now.  The number of
    //       channels/events are expected to be quite low and static, and the
    //       overhead of calling EventEmitter.emit() with no listeners is quite
    //       low.
  }

  get open(): bool {
    return this._open;
  }

  _emitLocalChannelEvent(event: string, payload: Object) {
    super.emit(event, payload);
  }

  _newListener = (event: string, listener: Function) => {
    for (let recipient of this._connections._connections) {
      const channel = recipient.getChannel(this._label);
      if (channel) {
        channel.on(event, data => this._emitLocalChannelEvent(event, data));
      }
    }
  };

  _onDataChannel(channel: StructuredDataChannel) {
    // $FlowFixMe: Flow thinks that EventEmitter.eventNames() doesn't exist, https://github.com/facebook/flow/pull/2206
    const eventNames: Array<string> = this.eventNames();

    eventNames.forEach(event => {
      if (event !== 'newListener') {
        channel.on(event, data => this._emitLocalChannelEvent(event, data));
      }
    });

    channel.on('open', () => this._emitLocalState());
    channel.on('close', () => this._emitLocalState());
  }

  _emitLocalState() {
    let open = false;

    for (let recipient of this._connections._connections) {
      const channel = recipient.getChannel(this._label);
      if (channel) {
        open = channel.open;
      }
      if (open) {
        break;
      }
    }
    if (open !== this._open) {
      const event = open ? 'open' : 'close';
      this._open = open;
      log.verbose(`ChannelEventEmitter state for ${this._label}: ${event}`);
      super.emit(event);
    }
  }

  emit(event: string, payload: Object): bool {
    let sent = false;
    if (!this._open) {
      log.info('Ignoring', event, 'on closed channel:', this._label);
    } else {
      for (let recipient of this._connections._connections) {
        const channel = recipient.getChannel(this._label);
        if (channel && channel.open) {
          if (channel.bufferedAmount <= this.maxBufferedAmount) {
            channel.emit(event, payload);
            sent = true;
          } else {
            log.info(`${this._label} channel full.` +
                     `${channel.bufferedAmount} > ${this.maxBufferedAmount}`);
          }
        }
      }
    }
    return sent;
  }
}


export default class Connections extends EventEmitter {
  state: ConnectionsState = 'disconnected';

  _ws: ?WebSocket = null;
  _wsDuplex: ?WebSocketDuplexStream = null;
  _wsUrl: ?string = null;
  _reconnectTimer: ?number = null;
  _reconnectSleep: number = 0;
  _reconnectAttempts: number = 0;
  _running: bool = false;
  _serversTable: ?SasCompositeClient;
  _serverUrl: ?string;
  _mux: ?MultiplexStream = null;
  _connections: Set<Peer> = new Set();
  _channelEmitters: {[key: string]: ChannelEventEmitter} = {};

  /**
   * Connected to the signaling server?
   */
  get connected(): bool {
    if (!this._ws) {
      return false;
    }

    return this._ws.readyState === WebSocket.OPEN;
  }

  /**
   * 1 or more peers connected?
   */
  get peerConnected(): bool {
    return this._connections.size > 0;
  }

  /**
   * When running reset the reconnect timers and attempt a retry.
   */
  reconnect() {
    if (!this._running) {
      return;
    }
    switch (this.state) {
    case 'disconnected':
    case 'reconnecting':
      log.info(`Scheduling reconnect`);

      // Ensure we try ASAP.
      this._resetReconnects();

      // Reset any current reconnect timer.
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }

      this._scheduleReconnect();
      break;
    default:
      log.info(`Ignoring reconnect request, state is`, this.state);
      break;
    }
  }

  start(): void {
    if (this._running) {
      return;
    }
    invariant(this.state === 'disconnected');

    log.info('Connections start');
    this._running = true;
    this._connect();
  }

  stop() {
    log.info(`Stopping connections ...`);
    this._running = false;

    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    for (let connection of this._connections) {
      connection.destroy();
    }

    if (this._ws) {
      this._ws.close();
      this._cleanupListeners();
    }
    this.state = 'disconnected';
  }

  /**
   * Create a bi-directional stream to communicate with the silk cloud.
   */
  creatCloudStream(type: string, payload: {[key: string]: mixed}): VirtualStream {
    const mux = this._mux;
    invariant(mux);
    return mux.createStream({
      type,
      payload,
    }, `cloud stream: ${type}`);
  }

  /**
   * Retrieves an EventEmitter for the requested channel
   */
  getChannel(label: string): EventEmitter {
    let emitter = this._channelEmitters[label];
    if (!emitter) {
      emitter = this._channelEmitters[label] =
        new ChannelEventEmitter(label, this);
    }
    return emitter;
  }


  /**
   * TODO: Deprecate send() in favor of .getChannel()
   */
  send(channelName: string, event: string, payload: Object): bool {
    let sent = false;
    for (let recipient of this._connections) {
      const channel = recipient.getChannel(channelName);
      if (channel) {
        invariant(channel);
        if (channel.open) {
          channel.emit(event, payload);
          sent = true;
        }
      }
    }
    if (!sent) {
      log.verbose(`Attempted to send on non-existent channel: ${channelName}`);
    }
    return sent;
  }

  _setState(newState: ConnectionsState): void {
    const previousState = this.state;
    this.state = newState;
    this.emit('stateChange', newState, previousState);
    log.info(`state change - new ${newState}, old ${previousState}`);
  }

  _resetReconnects() {
    this._reconnectAttempts = 0;
    this._reconnectSleep = 0;
  }

  /**
   * Find the most viable signaling server to connect to.
   *
   * TODO: In the future we should pick the most optimal region with the least
   * amount of load.
   */
  async _getSignalingServerUrl(): Promise<string> {
    if (this._serverUrl) {
      return this._serverUrl;
    }

    if (!this._serversTable) {
      let { sas, publicUrl } = await api.device.getSasForSignaling({});

      if (publicUrl) {
        this._serverUrl = publicUrl;
        return this._serverUrl;
      }

      // We may need to stop and start this class during reconfigure. Setting up
      // the table on start allows us to get a different SAS token as needed.
      this._serversTable = new SasCompositeClient(async () => {
        if (sas) {
          const returnSas = sas;
          sas = null;
          return returnSas;
        }

        try {
          const { sas } = await api.device.getSasForSignaling({});
          return sas;
        } catch (err) {
          log.error(`Failed to get SAS tokens to find signaling servers: ${err.stack}`);
          throw err;
        }
      });
    }

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
  _scheduleReconnect(): void {
    invariant(this.state === 'disconnected' || this.state === 'reconnecting');
    this._cleanupListeners();
    // If the .stop call has been made do not reconnect.
    if (!this._running) {
      return;
    }

    // Only schedule a reconnect if one is not pending!.
    if (this._reconnectTimer !== null) {
      return;
    }

    log.info(
      `Will attempt a reconnect in: ${this._reconnectSleep} ` +
      `(attempt: ${this._reconnectAttempts})`
    );

    this._setState('reconnecting');
    this._reconnectTimer = setTimeout(this._reconnect, this._reconnectSleep);
  }

  _reconnect: () => Promise<void> = async (): Promise<void> => {
    // Important that this is reset as early as possible in this function.
    this._reconnectTimer = null;

    // If we are using a hardcoded url reset it if we reconnect to ensure that
    // it has not changed...
    this._serverUrl = null;
    this._reconnectAttempts++;
    this._reconnectSleep = Math.min(
      Math.pow(this._reconnectAttempts, 2) * RECONNECT_SLEEP_INTERVAL,
      MAX_RECONNECT_SLEEP,
    );

    this._connect();
  };

  async _connect(): Promise<void> {
    invariant(!this._ws);
    invariant(this.state === 'disconnected' || this.state === 'reconnecting');
    this._setState('connecting');
    process.nextTick(() => {
      this.emit('connecting');
    });

    let url;
    try {
      url = this._wsUrl = await this._getSignalingServerUrl();
    } catch (err) {
      this._onWsError(err);
      return;
    }

    // Possible we got a stop already ...
    if (!this._running) {
      return;
    }

    log.info(`Connecting to signaling server: ${url}`);
    try {
      const signedUrl = await api.genSignSignalingUrl('device', url);
      const ws = this._ws = new WebSocket(signedUrl);

      ws.on('open', this._onWsOpen);
      ws.on('error', this._onWsError);
      ws.on('close', this._onWsClose);
    } catch (err) {
      this._onWsError(err);
    }
  }

  _onSignaling: (stream: VirtualStream) => Promise<void> = async (stream) => {
    log.info(`Got signaling client ...`);
    this.emit('request', stream);
    let recipient;
    try {
      recipient = answer(new JSONDuplexStream(stream));

      // This essentially lets the peer request any kind of media it wants without restrictions.
      // In the future we will need more advanced logic here to limit the total number of streams
      // and more.
      recipient.setMediaRequestHandler((label: string, constraints: UserMediaConstraints) => {
        return recipient.requestLocalMediaStream(constraints);
      });

      await recipient.connect();
      this.emit('connection', recipient);
    } catch (err) {
      log.error(`Failed to signal in webrtc connection: ${err.stack}`);
      return;
    } finally {
      log.info(`Ending signaling stream`);
      stream.end();
    }

    const onDataChannel = (channel: StructuredDataChannel) => {
      log.verbose('new data channel', channel.label);

      // Check if there is already interest in this channel
      let emitter = this._channelEmitters[channel.label];
      if (emitter) {
        emitter._onDataChannel(channel);
      }
    };

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
      recipient.removeListener('datachannel', onDataChannel);
      recipient.removeListener('error', onError);
      recipient.removeListener('close', onClose);
      this._connections.delete(recipient);
    };

    recipient.on('datachannel', onDataChannel);
    recipient.on('error', onError);
    recipient.on('close', onClose);

    // XXX: More ugliness for running...
    if (!this._running) {
      recipient.close();
      return;
    }

    // Connect any data channels that are already present
    for (let label in this._channelEmitters) {
      const channel = recipient.getChannel(label);
      if (channel) {
        onDataChannel(channel);
      }
    }

    this._connections.add(recipient);
    log.info('Registered a new client.');
    this.emit('connection', recipient);
  };

  _cleanupListeners: () => void = () => {
    // Cleanup any previous websocket listeners ...
    const ws = this._ws;
    const wsDuplex = this._wsDuplex;
    const mux = this._mux;
    this._wsDuplex = this._ws = this._mux = null;

    if (mux) {
      mux.removeListener('data', this._onSignaling);
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
      wsDuplex.once('close', () => {
        wsDuplex.removeListener('error', this._onWsDuplexError);
      });
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
    this._wsDuplex = new WebSocketDuplexStream(this._ws, {
      log,
    });
    this._wsDuplex.on('error', this._onWsDuplexError);

    this._mux = new MultiplexStream(this._wsDuplex);

    this._mux.on('data', this._onSignaling);

    if (this._reconnectAttempts) {
      log.info(`Reconnected after ${this._reconnectAttempts} attempts`);
      this._resetReconnects();
    }
  };

  _onWsDuplexError: (err: Error) => void = (err) => {
    // Error after close most likely this was a disconnect which we have handled
    // already ...
    if (!this._wsDuplex || this._wsDuplex.readyState > WebSocket.OPEN) {
      return;
    }

    log.info(`(non fatal) Unexpected websocket duplex error: ${err.stack}`);
  };

  _onWsError: ErrorEventCb = (err) => {
    this._setState('disconnected');
    this.emit('disconnect');
    log.error(`Failed to connect to signaling server: ${err.stack}`);
    this._scheduleReconnect();
  };

  _onWsClose: CloseEventCb = (code, reason) => {
    this._setState('disconnected');
    this.emit('disconnect');
    log.info(`Signaling server has closed ... (${code} ${reason || '' })`);
    this._scheduleReconnect();
  };
}
