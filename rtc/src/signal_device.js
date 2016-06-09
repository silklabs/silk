/**
 * @flow
 */

import invariant from 'assert';
import { EventEmitter } from 'events';
import eventToPromise from 'event-to-promise';
import WebSocket from 'ws';
import SasCompositeClient from 'silk-azure-storage/src/sas_composite_table';
import createLog from 'silk-log';
import { JSONDuplexStream, WebSocketDuplexStream } from 'silk-streams';
import timeout from 'silk-utils/timeout';

import StructuredDataChannel from './structured_data_channel';
import Peer from './peer';
import * as call from './call';

import type { SilkApi } from 'silk-api';
import type { CallOptions, MediaStreamsPair } from './call';

const WEBSOCKET_CONNECT_TIMEOUT = 30 * 1000;
const MAX_RECONNECT_SLEEP = 30 * 1000;
const RECONNECT_SLEEP_INTERVAL = 100;

const log = createLog('rtc:signal_device');

function ensureWebSocketScheme(url: string): string {
  if (url.indexOf('https') === 0) {
    return url.replace('https://', 'wss://');
  }

  if (url.indexOf('http') === 0) {
    return url.replace('http://', 'ws://');
  }

  return url;
}

export class DevicePeer extends EventEmitter {
  _api: SilkApi;
  _deviceId: string;
  _accountId: ?string;
  _callOptions: CallOptions;
  _devicesTable: ?SasCompositeClient;

  /**
   * _deviceUrl only set in special situations for development. Once set we will
    * use this url instead of looking at azure-table for device -> server pair.
   */
  _deviceUrl: ?string;
  _caller: ?Peer;
  _connecting: bool;
  _disconnecting: bool;
  _reconnectSleep: number = 0;
  _reconnectAttempts: number = 0;
  _reconnectTimer: ?number;
  _channels: Map<string, StructuredDataChannel> = new Map();
  _streams: MediaStreamsPair = {};

  constructor(api: SilkApi, deviceId: string, options: CallOptions) {
    super();
    this._api = api;
    this._deviceId = deviceId;
    this._callOptions = options;

    if (options.dataChannels) {
      for (let label in options.dataChannels) {
        // The underlying data channel is set later ...
        this._channels.set(label, new StructuredDataChannel());
      }
    }
    if (options.mediaStreams) {
      // If the caller is expecting a remote stream, it will be set
      // later.
      Object.assign(this._streams, options.mediaStreams);
    }
  }

  channel(label: string): ?StructuredDataChannel {
    return this._channels.get(label);
  }

  _onClose: () => void = () => {
    log.info(`Unexpected disconnect from device`);
    invariant(this._caller);
    const caller = this._caller;
    this._caller = null;

    for (let structuredChannel of this._channels.values()) {
      structuredChannel.setChannel(null);
    }
    if ('remote' in this._streams) {
      this._streams.remote = null;
    }

    caller.removeListener('close', this._onClose);
    this.emit('disconnect');
    this._reconnect();
  };

  async _getDeviceServerUrl(): Promise<string> {
    if (this._deviceUrl) {
      return this._deviceUrl;
    }

    if (!this._accountId) {
      // TODO: This should ideally be stored in silk-api on login or something.
      const { accountId } = await this._api.account.whoami({});
      this._accountId = accountId;
    }

    if (!this._devicesTable) {
      let { sas, publicUrl } = await this._api.account.getSasForDeviceSignaling({});
      if (publicUrl) {
        publicUrl = ensureWebSocketScheme(publicUrl);
        log.info(`Signaling publicUrl found using only this host: ${publicUrl}`);
        this._deviceUrl = publicUrl;
        return publicUrl;
      }

      this._devicesTable = new SasCompositeClient(async () => {
        // Since we already fetched it do not repeat ourselves.
        if (sas) {
          const returnSas = sas;
          sas = null;
          return returnSas;
        }
        try {
          const { sas } = await this._api.account.getSasForDeviceSignaling({});
          return sas;
        } catch (err) {
          log.fatal(`Failed to get sas for signaling! (fatal)`);
          throw err;
        }
      });
    }

    const query = await this._devicesTable.query({
      PartitionKey: this._accountId,
      RowKey: this._deviceId,
    });

    if (query.length === 0) {
      throw new Error(`Failed to find device ${this._deviceId} to signal`);
    }

    const entity = query[0];
    invariant(entity.host);
    return ensureWebSocketScheme(entity.host);
  }

  _reconnect: () => Promise<void> = async () => {
    try {
      if (this._reconnectAttempts) {
        this.emit('reconnecting');
      }

      const url = await this._getDeviceServerUrl();
      const signedUrl = await this._api.genSignSignalingUrl('account', url, {
        deviceId: this._deviceId,
      });

      const websocket = new WebSocket(signedUrl);
      const websocketStream = new WebSocketDuplexStream(websocket, {
        log,
      });
      const transport = new JSONDuplexStream(websocketStream);

      // Build the connection ...
      const [peerConnection, dataChannels, mediaStreams] =
              call.createCaller(this._callOptions);

      // Immediately start to signal we will handle errors in parallel.
      await Promise.all([
        call.peer([peerConnection, dataChannels, mediaStreams], transport),
        // Will also ensure error is handled.
        Promise.race([
          eventToPromise(websocket, 'open'),
          timeout(
            WEBSOCKET_CONNECT_TIMEOUT,
            new Error(`Failed to connect to signaling server: ${WEBSOCKET_CONNECT_TIMEOUT}`)
          ),
        ]),
      ]);

      // Setup the dataChannels again ...
      for (let [label, channel] of dataChannels.entries()) {
        const structuredChannel = this._channels.get(label);
        invariant(structuredChannel);
        structuredChannel.setChannel(channel);
      }

      // TODO: This is sorta hacky we use the Peer object only to provide the
      // close method and handle disconnects.
      this._caller = new Peer(log, {
        peerConnection,
        dataChannels: this._channels,
        mediaStreams: this._streams,
      });

      this._caller.on('close', this._onClose);

      if (this._disconnecting) {
        this._caller.close();
        return;
      }

      log.info(`Successfully connected to device (${this._deviceId})`);
      if (this._reconnectAttempts) {
        this.emit('reconnect');
        log.info(`Connected to device after ${this._reconnectAttempts} attempts`);
      }
      this._reconnectAttempts = 0;
      this._reconnectSleep = 0;
      this.emit('connect');
    } catch (err) {
      if (this._disconnecting) {
        return;
      }

      log.error(`Error connecting to device: ${err.stack}`);
      this.emit('reconnect_error', err);

      // Do the reconnect now ...
      this._reconnectAttempts++;
      this._reconnectSleep = Math.min(
        Math.pow(this._reconnectAttempts, 2) * RECONNECT_SLEEP_INTERVAL,
        MAX_RECONNECT_SLEEP,
      );

      log.info(`Will attempt reconnect to device: ${this._deviceId} in ${this._reconnectSleep} ms`);
      this._reconnectTimer = setTimeout(this._reconnect, this._reconnectSleep);
    }
  };

  connect() {
    if (this._connecting) {
      return;
    }

    this._disconnecting = false;

    log.info('connecting...');
    this._connecting = true;
    this._reconnect();
  }

  disconnect() {
    this._connecting = false;
    this._disconnecting = true;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}

export default function signalDevice(
  api: SilkApi,
  deviceId: string,
  options?: CallOptions = {}
): DevicePeer {
  const devicePeer = new DevicePeer(api, deviceId, options);
  devicePeer.connect();
  return devicePeer;
}
