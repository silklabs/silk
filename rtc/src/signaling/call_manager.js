/**
 * @flow
 */
import invariant from 'assert';
import eventToPromise from 'event-to-promise';
import WebSocket from 'ws';
import SasCompositeClient from 'silk-azure-storage/src/sas_composite_table';
import createLog from 'silk-log';
import { JSONDuplexStream, WebSocketDuplexStream } from 'silk-streams';

import Manager from './manager';
import TransportEmitter from '../transport_emitter';
import DataChannelDuplex from '../data_channel_duplex';

import type { Duplex } from 'stream';
import type { SilkApi } from 'silk-api';

import type { RTCPeerConnection } from '../webrtc';

export type CallPeer = {
  transport: TransportEmitter;
};

const log = createLog('rtc:signaling:call_manager');

function ensureWebSocketScheme(url: string): string {
  if (url.indexOf('https') === 0) {
    return url.replace('https://', 'wss://');
  }

  if (url.indexOf('http') === 0) {
    return url.replace('http://', 'ws://');
  }

  return url;
}

export default class CallManager extends Manager {

  static PEER_TYPE = 'caller';

  _api: SilkApi;
  _deviceId: string;
  _signedPublicKey: Promise<string>;

  _accountId: string;
  _deviceUrl: string;
  _devicesTable: SasCompositeClient;

  constructor(api: SilkApi, deviceId: string) {
    super();
    this._api = api;
    this._deviceId = deviceId;

    const {accessToken} = api;
    invariant(accessToken);

    this._signedPublicKey = accessToken.genSign(accessToken.pub);
  }

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
    invariant(typeof entity.host === 'string');
    return ensureWebSocketScheme(entity.host);
  }

  async _getStream(): Promise<Duplex> {
    const [url, signedPublicKey] = await Promise.all([
      this._getDeviceServerUrl(),
      this._signedPublicKey,
    ]);
    const signedUrl = await this._api.genSignSignalingUrl('account', url, {
      deviceId: this._deviceId,
      signedPublicKey,
    });

    const websocket = new WebSocket(signedUrl);
    try {
      await eventToPromise(websocket, 'open');
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(err.stack || err.message || err.name || err.type);
    }
    const websocketStream = new WebSocketDuplexStream(websocket, {
      log,
    });

    return new JSONDuplexStream(websocketStream);
  }

  async _signal(pc: RTCPeerConnection): Promise<TransportEmitter> {
    const stream = await this._getStream();
    const transport = new TransportEmitter(stream);

    const pendingDoneAck = eventToPromise(transport, 'done');

    const systemChannel = pc.createDataChannel(Manager.SIGNALING_DATA_CHANNEL, {});
    const systemTransport = new TransportEmitter(
      new JSONDuplexStream(new DataChannelDuplex(systemChannel))
    );

    await Promise.all([this._negotiateOffer(pc, transport), pendingDoneAck]);
    return systemTransport;
  }
}
