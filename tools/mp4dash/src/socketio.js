/**
 * @flow
 */

import invariant from 'assert';
import {default as createApi, AccessToken} from 'silk-api';
import createLog from 'silk-log';
import socketio from 'socket.io-client';

import config from './config';

import type { Socket } from 'socket.io-client';

const log = createLog('socketio');

export default async function connectToSocketIO(): Promise<Socket> {
  let api = createApi({
    serverUrl: config.serverUrl,
    metrics: {
      type: 'account',
      tags: {},
    },
  });

  api.accessToken = await AccessToken.gen();

  log.info('Attempting to authenticate with server.');
  let result;
  try {
    result = await api.vip.signInWithPassword({
      email: config.user,
      password: config.password,
      userAgent: 'node',
    });
  } catch (error) {
    log.error(error);
    process.exit(1); // eslint-disable-line no-process-exit
  }

  invariant(result);

  if (!result.success) {
    log.error('Could not log in!', result);
    process.exit(0); // eslint-disable-line no-process-exit
  }

  log.info('Connecting to socket.io');
  let socket = api.socketioClient(socketio, 'account', {});
  socket.connect();
  await new Promise((resolve) => socket.once('connect', resolve));
  return socket;
}
