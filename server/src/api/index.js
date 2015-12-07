/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import loadConfig from './config';
import URL from 'url';
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

import {signature} from './jwt_request_signature';
import makeBlob from './blob'; // TODO: Remove
import makeCrashMeta from './crash_metadata';
import makeSocketio from './socketio';
import makeStreams from './streams';

export const BTLE_SOCKET_UUIDS = {
  service: 'e0f3a744-fb2f-46f1-b45a-f2b398f2a424',

  read: '9c333756-62c3-4141-8ee5-fed0d9f84a72',
  write: 'ef4cf114-5d10-4b73-8a5f-214aae42c6f9',

  // XXX Remove soon
  characteristic: '59ba85fb-6fba-439c-95b0-9307e62d4ca1',
};

export { default as createStreams } from './streams';
export { default as RssiSmoother } from './rssi_smoother';

function socketioConfig(accessToken, url) {
  let parsed = URL.parse(url, true /* parse query string */);
  parsed.query.jwt = signature(accessToken, 'GET', parsed.path);
  delete parsed.search;

  /**
   * - socket.io-client will ignore path and query parameters so we must parse
   *   the out and pass them as options...
   *
   * - The signature does not include the host so pass only the path+query...
   */
  return [URL.format(parsed), {
    transports: ['websocket'],
    path: parsed.pathname,
    query: parsed.query,
  }];
}

export default function create(options) {
  let accessToken = null;
  let api = {
    loadConfig(options) {
      const config = loadConfig(options);

      // Load/reload only the portions of the API that are dependent on the config
      Object.assign(api, {
        config,
        blob: makeBlob(config), // TODO: Remove
        crashMeta: makeCrashMeta(config),
        socketio: makeSocketio(config),
        streams: makeStreams(config),
      });

      const services = {
        vip: new VIP(config.serverUrl),
        account: new Account(config.serverUrl),
        crash: new Crash(config.serverUrl),
        device: new Device(config.serverUrl),
        blobPublisher: new BlobPublisher(config.serverUrl),
        crashPublisher: new CrashPublisher(config.serverUrl),
        metadataPublisher: new MetadataPublisher(config.serverUrl),
        metadata: new Metadata(config.serverUrl),
      };

      for (let key in services) {
        api[key] = services[key];
      }
      api._services = services;

      if (accessToken) {
        api.accessToken = accessToken;
      }
    },

    id: Id,

    // Export the developer account
    // TODO: Remove prior to production!
    devAccount: require('./dev_account'),

    // TODO: crypto has been working fine for a long time, but
    // react-native JS environment is unable to load the 'elliptic'
    // module, which otherwise works in both browser and node
    // environments.  Sigh.
    crypto: {
      create: () => {
        return {
          exportPublic: () => 'key',
          deriveShared: () => 'shared',
          encrypt: (text) => Promise.resolve(text),
          decrypt: (text) => text,
        };
      },
    },

    RssiSmoother,

    set accessToken(token) {
      accessToken = token;
      for (let key in api._services) {
        // TODO: Rename .key once consumers are using this new way of setting
        // the accessToken.
        //
        // .key = accessToken...
        api._services[key].key = token;
      }
    },

    get accessToken() {
      return accessToken;
    },

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
    socketioClient: (socketFactory, type, overrides = {}) => {
      let configFn;
      switch (type) {
      case 'account':
        configFn = api.socketioAccountConfig;
        break;
      case 'device':
        configFn = api.socketioDeviceConfig;
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
    },

    socketioDeviceConfig: async () => {
      let {url} = await api.device.socketioURL();
      return socketioConfig(accessToken, url);
    },

    socketioAccountConfig: async () => {
      let {url} = await api.account.socketioURL();
      return socketioConfig(accessToken, url);
    },
  };

  api.loadConfig(options);
  return api;
}
