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
import AccessToken from './access_token';
import MetricsAgent from './metrics_agent';

import loadConfig from './config';
import devAccount from './dev_account';
import fetch from './fetch';

import type {StringToStringDict} from './metric';
import type {Request} from 'silk-http/src/client';

// New consumers should refer to "id" as AccessToken.
export { default as AccessToken } from './access_token' ;
export {
  default as CryptoSign,
  overrideImplementation as overrideCryptoSignImplementation,
} from './crypto_sign';
export { default as RssiSmoother } from './rssi_smoother';
export { default as Metric } from './metric';
export { default as MetricTypes } from './metric_types';

export const BTLE_SOCKET_UUIDS = {
  service: '78955692e50a4dfdb1f0f59303ebf4cb',
  read: '9c33375662c341418ee5fed0d9f84a72',
  write: 'ef4cf1145d104b738a5f214aae42c6f9',
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
  requestTransformer = async (req: Request): Promise<Request> => {
    let [url, options] = req;

    // Ensure URL is absolute ...
    url = URL.resolve(this.serverUrl, url);
    let parsedUrl = URL.parse(url);
    invariant(parsedUrl.pathname);

    // Convert the body ... Being careful to not repeat work if given a string.
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
    }

    const signature = await this.accessToken.genSignRequest(
      options.method,
      parsedUrl.pathname,
      options.body || ''
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
