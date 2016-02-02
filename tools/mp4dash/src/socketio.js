import crypto from 'crypto';
import process from 'process';
import createApi from 'silk-api';
import createLog from 'silk-log';
import socketio from 'socket.io-client';

import config from './config';

import type { Socket } from 'socket-io.client';

const log = createLog('socketio');

const DEFAULT_ROUNDS = 64000;
const SHA256_KEYLENGTH = 32;
const SHA256_HMAC_STRENGTH = 192;

export default async function connectToSocketIO(): Promise<Socket> {
  let api = createApi({ serverUrl: config.serverUrl });
  let passwordHash = crypto.pbkdf2Sync(
    config.password,
    config.user,
    DEFAULT_ROUNDS,
    SHA256_KEYLENGTH,
    'sha256'
  );

  let entropy = crypto.randomBytes(SHA256_HMAC_STRENGTH);
  api.accessToken = api.id.create({ entropy });

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

  if (!result.success) {
    log.error('Could not log in!', result);
    process.exit(0); // eslint-disable-line no-process-exit
  }

  log.info('Connecting to socket.io');
  let socket = api.socketioClient(socketio, 'account');
  socket.connect();
  await new Promise((resolve) => socket.once('connect', resolve));
  return socket;
}
