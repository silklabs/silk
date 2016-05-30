/**
 * Helper for deciding which hostname to use when not given an explicit one.
 *
 * @flow
 */

import os from 'os';
import * as net from 'net';

import eventToPromise from 'event-to-promise';
import createLog from 'silk-log';

const log = createLog('private_ip');
const CONNECT_TIMEOUT = 100;

// module level cache for private ip so we do not have to recheck.
let privateIp = null;

/**
 * Attempt to find the private ip (and verify that it works).
 *
 * Will fallback to the given string if cannot connect within 100ms.
 *
 */
export default async function(fallback: string = '127.0.0.1'): Promise<string> {
  if (process.env.SILK_HOST) {
    return process.env.SILK_HOST;
  }

  if (privateIp) {
    return privateIp;
  }

  const families = os.networkInterfaces();

  let externalInterfaces = [];
  for (let family in families) {
    let interfaces = families[family];

    for (let netInterface of interfaces) {
      if (netInterface.family === 'IPv4' && !netInterface.internal) {
        externalInterfaces.push(netInterface);
      }
    }
  }

  log.verbose(`Have: ${externalInterfaces.length} external interfaces.`);

  for (let netInterface of externalInterfaces) {
    const host = netInterface.address;
    log.info(`Attempting to bind then connect on: ${host}`);
    const server = net.createServer();
    try {
      // yay we can listen ...
      log.info(`Waiting for bind: ${host}`);
      server.listen({ host, port: 0 });
      await eventToPromise(server, 'listening');
      const port = server.address().port;

      // try to connect ...
      log.info(`Waiting for connect: ${host}`);
      const socket = net.connect({ port, host });
      socket.setTimeout(CONNECT_TIMEOUT);
      await eventToPromise(socket, 'connect');

      // eat any and all errors for socket/server ...
      socket.on('error', () => {});
      server.on('error', () => {});

      socket.end();
      server.close();
      log.info(`Can successfully connect on : ${host}`);
      privateIp = host;
      return host;
    } catch (err) {
      // keep going ...
      log.info(`Failed to bind or connecton : ${host} ${err.stack}`);
    }
  }

  return fallback;
}
