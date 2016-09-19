/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc
 *
 * @flow
 */
import invariant from 'assert';
import URL from 'url';
import fetch, {Headers} from 'silk-fetch';
import createLog from 'silk-log';

import VIP from './vip';
import Account from './gen/account';
import Device from './gen/device';
import Crash from './gen/crash';
import BlobPublisher from './gen/blob_publisher';
import CrashPublisher from './gen/crash_publisher';
import MetadataPublisher from './gen/metadata_publisher';
import Metadata from './gen/metadata';
import AccessToken from './access_token';
import MetricsAgent from './metrics_agent';

import loadConfig from './config';
import devAccount from './dev_account';

import type {Request} from 'silk-http-client';
import type {StringToStringDict} from './metric';

// New consumers should refer to "id" as AccessToken.
export { default as AccessToken } from './access_token' ;
export { default as RssiSmoother } from './rssi_smoother';
export { default as Metric } from './metric';
export { default as MetricTypes } from './metric_types';

export {MetricsAgent};

export const BTLE_SOCKET_UUIDS = {
  service: 'cefa220253c74285ac1ba6e6eb00bb79',
  characteristic: 'fd30740d8bdc4a4dad5866b4343ea3c1',
};

type SocketioConfig = [string, {
  transports: Array<string>;
  path: string;
  query: StringToStringDict;
}];

type AuthConfigOptions = {
  serverUrl: string;
  accessToken: ?AccessToken;
};

/**
 * We need the ability to "hot reload" the configuration of accessToken and the
 * serverUrl at will from webapp/app. Using a specific container type allows us
 * to do this by mutating the container (which can be shared) rather then every
 * api instance.
 */
class AuthConfig {
  serverUrl: string;
  accessToken: ?AccessToken;

  requestTransformer: (req: Request) => Promise<Request>
    = this.requestTransformer.bind(this);

  /**
   * Request transformer responsible for signing the request and constructing
   * the urls...
   */
  async requestTransformer(req: Request): Promise<Request> {
    let [url, options] = req;

    // Ensure URL is absolute ...
    url = URL.resolve(this.serverUrl, url);
    let parsedUrl = URL.parse(url);
    invariant(parsedUrl.pathname);

    // Convert the body ... Being careful to not repeat work if given a string.
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
    }

    // Making API requests without setting the API AccessToken first
    // is not supported.
    invariant(this.accessToken);
    const signature = await this.accessToken.genSignRequest(
      options.method,
      parsedUrl.pathname,
      options.body || ''
    );

    let headers = options.headers = options.headers || new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${signature}`);
    return [url, options];
  }

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

async function genSocketioConfig(
  accessToken: AccessToken,
  url: string
): Promise<SocketioConfig> {
  const parsed = URL.parse(url, /* parse query string */ true);
  invariant(typeof parsed.path === 'string');

  const jwt = await accessToken.genSignRequest('GET', parsed.path);
  invariant(typeof parsed.query === 'object');
  parsed.query.jwt = jwt;

  // socket.io-client will ignore path and query parameters so we must
  // parse the out and pass them as options. The signature does not
  // include the host so pass only the path+query.
  delete parsed.search;
  // $FlowFixMe https://github.com/facebook/flow/issues/908
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

async function genSignSignalingUrl(
  url: string,
  type: 'account' | 'device',
  query: {[key: string]: string},
  accessToken: AccessToken,
): Promise<string> {
  const parsed = URL.parse(url, /* parse query string */ true);
  parsed.pathname = '/' + type;

  const jwt = await accessToken.genSignRequest('GET', parsed.pathname);
  parsed.query = Object.assign({}, query, { jwt });
  return URL.format(parsed);
}

export type Config = {
  serverUrl?: ?string;
  metrics: {
    type: 'account' | 'device';
    tags: StringToStringDict;
  };
};

export class SilkApi {

  config: Config;

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

  genSocketioDeviceConfig: (() => Promise<SocketioConfig>) = async () => {
    let {url} = await this.device.socketioURL();
    return await genSocketioConfig(this.config.accessToken, url);
  };

  genSocketioAccountConfig: (() => Promise<SocketioConfig>) = async () => {
    let {url} = await this.account.socketioURL();
    return await genSocketioConfig(this.config.accessToken, url);
  };

  /** Deprecated exports */

  // Deprecated use the re-export.
  id: Function = AccessToken;
  // Export the developer account
  // TODO: Remove prior to production!
  devAccount: Object = devAccount;

  set accessToken(accessToken: ?AccessToken) {
    this.config.accessToken = accessToken;
  }

  get accessToken(): ?AccessToken {
    return this.config.accessToken;
  }

  constructor(config: Config) {
    config = loadConfig(config);

    let authConfig = this.config = new AuthConfig({
      serverUrl: config.serverUrl || 'http://localhost:8081',
      accessToken: config.accessToken || null,
    });

    const httpClientOptions = {
      requestTransformer: authConfig.requestTransformer,
    };

    this.vip = new VIP(httpClientOptions);
    this.account = new Account(httpClientOptions);
    this.crash = new Crash(httpClientOptions);
    this.device = new Device(httpClientOptions);
    this.blobPublisher = new BlobPublisher(httpClientOptions);
    this.crashPublisher = new CrashPublisher(httpClientOptions);
    this.metadataPublisher = new MetadataPublisher(httpClientOptions);
    this.metadata = new Metadata(httpClientOptions);


    const metricsApi =
      config.metrics.type === 'device' ? this.device : this.account;
    this.metrics =
      new MetricsAgent(metricsApi, this.canReachServer, config.metrics.tags);
  }

  /**
   * Update the serverUrl or accessToken for all services.
   */
  loadConfig(config: $Shape<Config>) {
    config = loadConfig(config);
    this.config.update({
      serverUrl: config.serverUrl || this.config.serverUrl,
      accessToken: config.accessToken || this.config.accessToken,
    });
  }

  genSignSignalingUrl(
    type: 'device' | 'account',
    url: string,
    query: {[key: string]: string} = {},
  ): Promise<string> {
    invariant(this.accessToken, '.accessToken must be set');
    return genSignSignalingUrl(url, type, query, this.accessToken);
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
    let genConfig;
    switch (type) {
    case 'account':
      genConfig = this.genSocketioAccountConfig;
      break;
    case 'device':
      genConfig = this.genSocketioDeviceConfig;
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
        let [uri, opts] = await genConfig();
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

  canReachServer(): Promise<boolean> {
    const path = '/v1/account/socketio/url';
    const url = URL.resolve(this.config.serverUrl, path);
    log.verbose('canReachServer() ...', url);
    return fetch(url, {method: 'POST'})
      .then(() => {
        log.info('canReachServer(): true');
        return true;
      })
      .catch(() => {
        log.info('canReachServer(): false');
        return false;
      });
  }

  canReachServer: () => Promise<boolean> = this.canReachServer.bind(this);
}

export default function (config: Config): SilkApi {
  return new SilkApi(config);
}
