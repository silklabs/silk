/**
 * @flow
 */
import invariant from 'assert';
import URL from 'url';

import loadConfig from './config';
import VIP from './vip';
import Account from './gen/account';
import Device from './gen/device';
import Crash from './gen/crash';
import BlobPublisher from './gen/blob_publisher';
import CrashPublisher from './gen/crash_publisher';
import MetadataPublisher from './gen/metadata_publisher';
import Metadata from './gen/metadata';
import Id from './id';
import RssiSmoother from './rssi_smoother';
import {StateContainer} from './http_client';
import MetricsAgent from './metrics_agent';

import {signature} from './jwt_request_signature';
import makeStreams from './streams';

// New consumers should refer to "id" as AccessToken.
export { default as AccessToken } from './id' ;
export { default as RssiSmoother } from './rssi_smoother';
export { default as Metric, Integer, Float }  from './metric';

export const BTLE_SOCKET_UUIDS = {
  service: '78955692-e50a-4dfd-b1f0-f59303ebf4cb',
  read: '9c333756-62c3-4141-8ee5-fed0d9f84a72',
  write: 'ef4cf114-5d10-4b73-8a5f-214aae42c6f9',
};

export { default as createStreams } from './streams';
export { default as RssiSmoother } from './rssi_smoother';

type SocketioConfig = [string, {
  transports: Array<string>;
  path: string;
  query: {[key: string]: string};
}]

function socketioConfig(accessToken: Id, url: string): SocketioConfig {
  // TODO: remove 'any' type here once
  // https://github.com/facebook/flow/issues/1173 is resolved.
  let parsed: any = URL.parse(url, true /* parse query string */);
  invariant(typeof parsed.path === 'string');

  let jwt = signature(accessToken, 'GET', parsed.path);
  invariant(typeof parsed.query === 'object');
  parsed.query.jwt = jwt;

  // socket.io-client will ignore path and query parameters so we must
  // parse the out and pass them as options. The signature does not
  // include the host so pass only the path+query.
  delete parsed.search;
  url = URL.format(parsed);

  invariant(typeof parsed.pathname === 'string');
  invariant(typeof parsed.query === 'object');
  let options = {
    transports: ['websocket'],
    path: parsed.pathname,
    query: parsed.query,
  };
  return [url, options];
}

export type Config = {
  getRandomBytes?: (
    size: number,
    callback: (err: ?Error, buffer: Buffer) => void
  ) => void;
  serverUrl?: string;
};

export class SilkApi {

  config: Config;
  streams: any; // TODO: Streams should be moved out of silk-api.

  vip: VIP;
  account: Account;
  crash: Crash;
  device: Device;
  blobPublisher: BlobPublisher;
  crashPublisher: CrashPublisher;
  metadataPublisher: MetadataPublisher;
  metadata: Metadata;

  // NOTE: This really shows how we may want to split these up or make some of our
  // endpoints "polymorphic" so we can allow both account and device clients.
  deviceMetrics: MetricsAgent;
  accountMetrics: MetricsAgent;

  config: StateContainer;

  // XXX: Remove me should be re-export.
  RssiSmoother: Function = RssiSmoother;

  socketioDeviceConfig: (() => Promise<SocketioConfig>) = async () => {
    let {url} = await this.device.socketioURL();
    return socketioConfig(this.config.accessToken, url);
  };

  socketioAccountConfig: (() => Promise<SocketioConfig>) = async () => {
    let {url} = await this.account.socketioURL();
    return socketioConfig(this.config.accessToken, url);
  };

  /** Deprecated exports */

  // Deprecated use the re-export.
  id: Function = Id;
  // Export the developer account
  // TODO: Remove prior to production!
  devAccount: Object = require('./dev_account');

  set accessToken(accessToken: ?Id) {
    this.config.accessToken = accessToken;
  }

  get accessToken(): ?Id {
    return this.config.accessToken;
  }

  constructor(config: Config) {
    config = loadConfig(config);

    let state = this.config = new StateContainer({
      serverUrl: config.serverUrl || 'http://localhost:8081',
      accessToken: config.accessToken || null,
    });

    this.vip = new VIP(state);
    this.account = new Account(state);
    this.crash = new Crash(state);
    this.device = new Device(state);
    this.blobPublisher = new BlobPublisher(state);
    this.crashPublisher = new CrashPublisher(state);
    this.metadataPublisher = new MetadataPublisher(state);
    this.metadata = new Metadata(state);
    this.streams = makeStreams(config);

    this.deviceMetrics = new MetricsAgent(this.device);
    this.accountMetrics = new MetricsAgent(this.account);
  }

  /**
   * Update the serverUrl or accessToken for all services.
   */
  loadConfig(config: Config = {}) {
    config = loadConfig(config);
    this.config.update({
      serverUrl: config.serverUrl || this.config.serverUrl,
      accessToken: config.accessToken || this.config.accessToken,
    });

    this.streams = makeStreams(config);
  }

  /**
   * Because we need to periodically renew our JWT token (on each connect)
   * we must monkey patch the socket.io client.
   *
   * let io = api.socketioClient(require('socket.io-client'), 'account');
   *
   * There are two types of clients:
   *
   *   - account : Uses socket.io url for accounts.
   *   - device  : Uses socket.io url for devices.
   */
  socketioClient(socketFactory: any, type: string, overrides: Object): any {
    let configFn;
    switch (type) {
    case 'account':
      configFn = this.socketioAccountConfig;
      break;
    case 'device':
      configFn = this.socketioDeviceConfig;
      break;
    default:
      throw new Error(`Unknown socket.io client type ${type}`);
    }

    // This intentionally uses junk values since we override them in .open
    let socket = socketFactory('', {
      autoConnect: false,
      transports: ['websocket']
    });
    let manager = socket.io;
    // The .open call is used both during the initial connect and all reconnections...
    let superOpen = manager.open;
    manager.open = async (fn) => {
      try {
        let [uri, opts] = await configFn();
        manager.uri = uri;
        manager.opts = Object.assign({}, overrides, opts);
        Object.assign(manager, manager.opts);
        superOpen.call(manager, fn);
      } catch (err) {
        fn && fn(err);
      }
    };
    return socket;
  }
}

export default function (config: Config): SilkApi {
  return new SilkApi(config);
}
