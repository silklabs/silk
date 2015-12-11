import crypto from 'crypto';
import process from 'process';
import createApi from 'silk-api';
import createLog from 'log';
import socketio from 'socket.io-client';

const log = createLog('socketio');

const SERVER_URL = 'http://localhost:5000/';
const USER = 'e@silk.io';
const PASSWD = 'bbb';

const DEFAULT_ROUNDS = 64000;
const SHA256_KEYLENGTH = 32;
const SHA256_HMAC_STRENGTH = 192;

export default function connectToSocketIO(callback) {
  let api = createApi({ serverUrl: SERVER_URL });
  let passwordHash = crypto.pbkdf2Sync(
    PASSWD,
    USER,
    DEFAULT_ROUNDS,
    SHA256_KEYLENGTH,
    'sha256'
  );

  let entropy = crypto.randomBytes(SHA256_HMAC_STRENGTH);
  api.accessToken = api.id.create({ entropy });

  log.info('Attempting to authenticate with server.');
  api.vip.signIn({
    email: USER,
    passwordHash: passwordHash.toString('hex'),
    userAgent: 'node',
  }).then((result) => {
    if (!result.success) {
      console.error('Could not log in!', result);
      process.exit(0);
    }
    log.info('Connecting to socket.io');
    let socket = api.socketioClient(socketio, 'account');
    socket.on('connect', () => callback(socket));
    socket.connect();
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
