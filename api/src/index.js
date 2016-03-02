/**
 * @flow
 */
import invariant from 'assert';
import URL from 'url';
import createLog from 'silk-log';

import VIP from './vip';
import Account from './gen/account';
import Device from './gen/device';
import Crash from './gen/crash';
import BlobPublisher from './gen/blob_publisher';
import CrashPublisher from './gen/crash_publisher';
import MetadataPublisher from './gen/metadata_publisher';
import Metadata from './gen/metadata';
import Id from './access_token';
import RssiSmoother from './rssi_smoother';
import MetricsAgent from './metrics_agent';

import loadConfig from './config';
import {bodySignature} from './jwt_request_signature';
import devAccount from './dev_account';
import fetch from './fetch';
import {signature} from './jwt_request_signature';
import makeStreams from './streams';

import type {StringToStringDict} from './metric';
import type {Request} from 'silk-http/src/client';
import type AccessToken from './access_token';

// New consumers should refer to "id" as AccessToken.
export { default as AccessToken } from './access_token' ;
export { overrideImplementation as overrideCryptoSignImplementation } from './crypto_sign';
export { default as RssiSmoother } from './rssi_smoother';
export { default as Metric } from './metric';
export { default as MetricTypes } from './metric_types';
export { default as createStreams } from './streams';

export const BTLE_SOCKET_UUIDS = {
  service: '78955692-e50a-4dfd-b1f0-f59303ebf4cb',
  read: '9c333756-62c3-4141-8ee5-fed0d9f84a72',
  write: 'ef4cf114-5d10-4b73-8a5f-214aae42c6f9',
};

type SocketioConfig = [string, {
  transports: Array<string>;
  path: string;
  query: StringToStringDict;
}]

type AuthConfigOptions = {
  serverUrl: string;
  accessToken: ?AccessToken;
}

/**
 * We need the ability to "hot reload" the configuration of accessToken and the
 * serverUrl at will from webapp/app. Using a specific container type allows us
 * to do this by mutating the container (which can be shared) rather then every
 * api instance.
 */
class AuthConfig {
  serverUrl: string;
  accessToken: ?AccessToken;

  /**
   * Request transformer responsible for signing the request and constructing
   * the urls...
   */
  requestTransformer = (req: Request): Request => {
    let [url, options] = req;

    // Ensure URL is absolute ...
    url = URL.resolve(this.serverUrl, url);
    let parsedUrl = URL.parse(url);
    invariant(parsedUrl.pathname);

    // Convert the body ... Being careful to not repeat work if given a string.
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
    }

    let signature = bodySignature(
      this.accessToken,
      options.method,
      parsedUrl.pathname,
      options.body
    );

    options.headers = options.headers || {};
    options.headers = Object.assign({}, options.headers, {
      // XXX: Important that we always override previous headers ...
      'content-type': 'application/json',
      'authorization': `Bearer ${signature}`,
    });

    return [url, options];
  };

  constructor(options: AuthConfigOptions) {
    this.update(options);
  }

  update(options: AuthConfigOptions) {
    invariant(options.serverUrl);
    this.serverUrl = options.serverUrl;
    this.accessToken = options.accessToken;
  }
}

const log = createLog('api');

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
  metrics: {
    type: 'account' | 'device';
    tags: StringToStringDict;
  };
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
  metrics: MetricsAgent;

  config: AuthConfig;

  // XXX: Remove me should be re-export.
  RssiSmoother: typeof RssiSmoother = RssiSmoother;

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
  devAccount: Object = devAccount;

  set accessToken(accessToken: ?Id) {
    this.config.accessToken = accessToken;
  }

  get accessToken(): ?Id {
    return this.config.accessToken;
  }

  constructor(config: Config) {
    config = loadConfig(config);

    let authConfig = this.config = new AuthConfig({
      serverUrl: config.serverUrl || 'http://localhost:8081',
      accessToken: config.accessToken || null,
    });

    const httpClientOptions = {
      requestTransformer: authConfig.requestTransformer
    };

    this.vip = new VIP(httpClientOptions);
    this.account = new Account(httpClientOptions);
    this.crash = new Crash(httpClientOptions);
    this.device = new Device(httpClientOptions);
    this.blobPublisher = new BlobPublisher(httpClientOptions);
    this.crashPublisher = new CrashPublisher(httpClientOptions);
    this.metadataPublisher = new MetadataPublisher(httpClientOptions);
    this.metadata = new Metadata(httpClientOptions);
    this.streams = makeStreams(config);


    const metricsApi =
      config.metrics.type === `device` ? this.device : this.account;
    this.metrics =
      new MetricsAgent(metricsApi, this.canReachServer, config.metrics.tags);
  }

  /**
   * Update the serverUrl or accessToken for all services.
   */
  loadConfig(config: Config) {
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
      ...overrides,
      autoConnect: false,
      transports: ['websocket'],
    });
    let manager = socket.io;
    // The .open call is used both during the initial connect and all reconnections...
    let superOpen = manager.open;
    manager.open = async (fn) => {
      try {
        let [uri, opts] = await configFn();
        manager.uri = uri;
        Object.assign(manager.opts, opts);
        superOpen.call(manager, fn);
      } catch (err) {
        fn && fn(err);
        socket.emit('connect_error', err);
      }
    };
    return socket;
  }

  canReachServer: () => Promise<bool> = async () => {
    let path = '/v1/account/socketio/url';
    let url = URL.resolve(this.config.serverUrl, path);
    try {
      await fetch(url, { method: 'POST' });
      log.info('canReachServer(): true');
      return true;
    } catch (ex) {
      log.info('canReachServer(): false');
      return false;
    }
  };
}

export default function (config: Config): SilkApi {
  return new SilkApi(config);
}
