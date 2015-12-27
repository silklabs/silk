/**
 * @flow
 */
import eventToPromise from 'event-to-promise';
import createDb from '../server/db';
import sha256 from '../server/sha256';
import authorizeDevice from '../server/authorize_device';
import authorizeAccount from '../server/authorize_account';
import {listen as createSocketio} from 'socket.io';
import deviceRoutes from './routes/device';
import createLog from 'log';
import accountRoutes from './routes/account';

import URL from 'url';
import Devices from '../server/models/devices';
import Accounts from '../server/models/accounts';
import Nonce from '../server/models/nonce';
import AccountRoom from './account_room';

import type {Socket, Manager} from 'socket.io';

export type RouteContext = {
  devices: Devices;
  nonce: Nonce;
  accounts: Accounts;
  io: Manager;
}

export type EventHandlers = {
  [key: string]: (...any: any) => Promise<any>
};

const log = createLog('socketio:server');

export default async function main (config: any): any {
  let http = require('http').createServer(() => {} /* make flow happy */);
  let io = createSocketio(http, {
    path: '/',
    // Clients must bring their own socket.io package.
    serveClient: false,
    // Only use fast websocket transport...
    transports: ['websocket']
  });

  let db = await createDb(config);
  let nonce = new Nonce(db);
  let devices = new Devices(db);
  let accounts = new Accounts(db);
  let ctx: RouteContext = { nonce, devices, accounts, io };
  let rooms: Map<string, AccountRoom> = new Map();

  function signatureProvider(req: any): ?string {
    let {query} = URL.parse(req.url, true);
    return query && query.jwt;
  }

  const auth = {
    device: authorizeDevice({ devices, nonce }, { signatureProvider }),
    account: authorizeAccount({ accounts, nonce }, { signatureProvider }),
  };

  function getOrCreateRoom(accountId: string): AccountRoom {
    let room = rooms.get(accountId);
    if (room) {
      return room;
    }

    room = new AccountRoom(io, accountId);
    rooms.set(accountId, room);
    log.info(`Get room for account: ${accountId}`);
    return room;
  }

  function middleware(handler: (socket: Socket, next: Function) => Promise<any>): Function {
    return async function (socket, next) {
      try {
        await handler(socket, next);
      } catch (err) {
        log.error(`Error running middleware`, err.stack);
        next(err);
      }
    };
  }

  async function runMiddleware(fn: Function, ...args: Array<any>): Promise<any> {
    return new Promise((accept, reject) => {
      args.push((err) => {
        if (err) {
          reject(err);
          return;
        }
        accept();
      });
      fn(...args);
    });
  }

  function promiseWrap(name: string, fn: Function): Function {
    return async function(...args) {
      let ack = () => {};
      if (typeof args[args.length - 1] === 'function') {
        ack = args.pop();
      }

      try {
        log.verbose(`Begin handling ${name}`);
        await fn(...args);
        log.verbose(`Done handling ${name}`);
      } catch (err) {
        log.error(`Error handling event "${name}" ${err.stack}`);
      }
      // TODO: On error notify clients?
      ack();
    };
  }

  /**
   * NOTE: that all validation of connections _must_ happen in use... If done
   * elsewhere it is easy to create a race condition between new client events
   * and when the server has authenticated the client.
   */
  io.use(middleware(async (socket, next) => {
    var req = socket.request;
    let res = {
      sendStatus(code) {
        next(new Error(`Auth error ${code}`));
      }
    };

    let parsed = URL.parse(req.url, true);
    if (!parsed) {
      return;
      // throw new Error('Invalid request url');
    }

    let {query} = parsed;
    if (!query || !query.type || !(query.type in auth)) {
      next(new Error('Type query string missing or invalid...'));
      return;
    }

    if (!query.jwt) {
      next(new Error('.jwt field in query string is required...'));
      return;
    }

    // Semi-nasty tricks to remove .jwt from the query string and rebuild the path.
    delete query.jwt;

    let formattedUrl = URL.format({
      auth: parsed.auth || '',
      host: parsed.host || '',
      pathname: parsed.pathname || '',
      query: parsed.query || {},
    });

    if (!formattedUrl) {
      throw new Error('Formatted url invalid...');
    }

    let signUrl = URL.parse(formattedUrl);
    if (!signUrl) {
      throw new Error('After parse formatted url is invalid...');
    }

    // We must strip out the "jwt" query string portion of the url.

    // This server does not deal /w anything except socket.io requests so we
    // can simpify the hashing model here.
    let canonicalReq = `${signUrl.path}\n${req.method.toLowerCase()}`;
    // TODO: Figure how out to avoid appending to req like this...
    req.requestHash = sha256(canonicalReq);

    await runMiddleware(auth[query.type], req, res);

    if (query.type === 'device') {
      let room = getOrCreateRoom(req.device.accountId.toString());

      let session = {
        room,
        device: req.device,
        socket,
        publicKey: req.publicKey,
      };

      let events = deviceRoutes(session, ctx);
      await room.registerDevice(req.publicKey, socket);

      for (let event in events) {
        socket.on(event, promiseWrap(event, events[event]));
      }
    } else if (query.type === 'account') {
      let room = getOrCreateRoom(req.account._id.toString());
      let session = {
        room,
        account: req.account,
        socket,
        publicKey: req.publicKey,
      };

      let events = accountRoutes(session, ctx);
      await room.registerAccount(socket);

      for (let event in events) {
        socket.on(event, promiseWrap(event, events[event]));
      }
    } else {
      throw new Error(`Unknown client type ${query.type}`);
    }

    socket.on('disconnect', (err) => {
      log.error(`Client disconnect. io=${socket.id} err=${err}`);
    });

    socket.on('error', (err) => {
      // Something unexpected happened and the connection might now be unrecoverable.
      // Disconnect the device and hope it can reconnect.
      log.error(`socket error, disconnecting: io=${socket.id} ${err.stack}`);
      socket.disconnect(true);
    });

    next();
  }));

  http.listen(config.socketio.port);
  let errorEvent = eventToPromise(http, 'error').then(err => {
    throw err;
  });

  let connected = eventToPromise(http, 'listening').then(() => {
    // XXX: This is sorta a hack and only intended for development/testing...
    if (!config.socketio.publicUrl) {
      config.socketio.publicUrl = `http://localhost:${http.address().port}`;
    }
  });

  // await to be connected correctly...
  await Promise.race([errorEvent, connected]);

  // This interface is only ever supposed to be used from tests.
  return {
    // Useful because tests bind on 0 we don't know which port we are using
    // until this is done.
    port: http.address().port,

    // Do any cleanup here that would normally happen because of the server
    // process being killed. We do this instead of closing the process mostly
    // for performance.
    close: async() => {
      http.close();
    }
  };
}
