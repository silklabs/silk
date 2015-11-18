/* @flow */

import type {Server, IncomingMessage} from 'http';

declare module 'socket.io' {

  declare type NextFn = (err: ?Error) => void;

  declare class SocketioEvents {
    on(name: string, fn: (any: any) => void): void;
    once(name: string, fn: (any: any) => void): void;
    off(name: string): void;
    emit(name: string, ...args: any): any;
    removeListener(name: string): void;
  }

  declare class Manager extends SocketioEvents {
    nsps: {[key: string]: any}; // TODO: Finish type?
    use(fn: (socket: Socket, next: NextFn) => any): void;
    to(room: string): Manager;
  }

  declare class Socket extends SocketioEvents {
    id: string;
    request: IncomingMessage;

    leave(name: string, fn: (any: any) => any): void;
    join(name: string, fn: (any: any) => any): void;
    disconnect(close: bool): Socket;
  }

  declare type SocketioOptions = {
    path: ?string;
    serveClient: ?bool;
    transports: ?Array<string>;
  }

  // Convert to declare export default once https://github.com/facebook/flow/commit/7de33b5944c7948e86e3381d0bd1ad3fcc8a2355 is available.
  declare function listen (http: Server, options: SocketioOptions): Manager;
}
