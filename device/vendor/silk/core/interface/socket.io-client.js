/**
 * @providesModule socket.io-client
 * @flow
 */

import { EventEmitter } from 'events';

type ConnectOptions = {
  [key: string]: any;
};

declare export class Socket extends EventEmitter {
  connected: boolean;
  disconnected: boolean;

  open(): Socket;
  connect(): Socket;

  send(...args: any[]): Socket;

  close(): Socket;
  disconnect(): Socket;

  compress(compress: boolean): Socket;
}

declare export class Manager {
  // This is incomplete and should eventually be backfilled perhaps.
  // See https://github.com/silklabs/silk-device/issues/758
}

declare function lookup(uri: string, opts: ConnectOptions): Socket;
declare function connect(uri: string, opts: ConnectOptions): Socket;
