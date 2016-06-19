/**
 * @flow
 */

import invariant from 'assert';
import crypto from 'crypto';
import {default as createApi, AccessToken} from 'silk-api';
import createLog from 'silk-log';
import socketio from 'socket.io-client';

import config from './config';

import type { Socket } from 'socket.io-client';

const log = createLog('socketio');

const SHA256_KEYLENGTH = 32;

export default async function connectToSocketIO(): Promise<Socket> {
  let api = createApi({
    serverUrl: config.serverUrl,
    metrics: {
      type: 'account',
      tags: {},
    },
  });
  let passwordHash = crypto.pbkdf2Sync(
    config.password,
    config.user,
    api.vip.PBKDF2_ROUNDS,
    SHA256_KEYLENGTH,
    'sha256'
  );

  api.accessToken = await AccessToken.gen();

  log.info('Attempting to authenticate with server.');
  let result;
  try {
    result = await api.vip.signIn({
      email: config.user,
      passwordHash: passwordHash.toString('hex'),
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
