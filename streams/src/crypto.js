/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import crypto from 'crypto';
import * as silkCrypto from 'silk-crypto';
import makeLog from 'silk-log';

import ClosingTransform from './closing_transform';
import DuplexTransform from './duplex_transform';
import * as Metrics from './metrics';

import type {Duplex} from 'stream';
import type {
  DuplexStreamOptions,
  TransformCallback,
} from './types';

type QueuedData = {
  chunk: Buffer;
  encoding: string;
  callback: TransformCallback;
};

type KeyPair = [string, string];

const log = makeLog(`streams:crypto`);

class CryptoStreamBase extends ClosingTransform {

  static CIPHER_NAME = `aes-256-cbc`;
  static IV_LENGTH = 16;

  _sharedSecret: ?Buffer = null;
  _error: ?Error = null;

  constructor(options?: DuplexStreamOptions) {
    log.debug(`CryptoStreamBase()`);

    super(options);
  }

  _endWithError(error: Error): void {
    log.debug(`CryptoStreamBase._endWithError('${error.toString()}')`);

    if (this._error) {
      log.warn(`Received more than one error`, error);
    } else {
      this._error = error;
      this.emit(`error`, error);
      this.push(null);
    }
  }
}

// This class encrypts any data written to it. It requires a key pair at
// construction time and then needs a shared secret to be set before writes will
// be uncorked. Once uncorked it sends data in frames with the following format:
//
//   <Buffer AA AA AA AA BB BB BB BB XX XX XX XX XX XX XX XX XX XX XX...>
//
// Where the bytes are:
// - AA: the encoded size of the entire frame (see below for the integer
//       encoding details).
// - BB: the IV used for the cipher.
// - XX: the encrypted data.
//
// The encrypted data contains a one-byte sequence number that increases
// monotonically and wraps at 0xff. This sequence number is verified by the
// DecodeStream to ensure that no messages arrive out of order.
export class EncryptStream extends CryptoStreamBase {

  _bufferedWrites: Array<QueuedData> = [];
  _sequenceBuffer: Buffer;
  _randomBytes: Array<Buffer> = [];
  _pushedPublicKey: boolean = false;

  constructor(options?: DuplexStreamOptions) {
    log.debug(`EncryptStream()`);

    super(options);

    // Our sequence counter is just a single byte.
    this._sequenceBuffer = new Buffer([this._insecureRandomInt(0, 0xff)]);

    // Queue up several chunks of random bytes so that we are less likely to
    // block when sending data later.
    for (let index = 0; index < 5; index++) {
      this._feedRandomBytes();
    }
  }

  _insecureRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _feedRandomBytes(): void {
    silkCrypto.genRandomBytes(CryptoStreamBase.IV_LENGTH).then((random) => {
      this._randomBytes.push(random);

      if (this._pushedPublicKey &&
          this._sharedSecret &&
          this._bufferedWrites.length) {
        const {chunk, encoding, callback} = this._bufferedWrites.shift();
        this._processChunk(chunk, encoding, callback);
      }
    }).catch((error) => {
      this._endWithError(error);
    });
  }

  _encodeInteger(int: number): Buffer {
    // Each byte can hold 7 bits, and the high bit is used to indicate that the
    // value continues in the next byte.
    // E.g.:
    //   [ 0x00, 0x7f ]   -> <Buffer nn>
    //   0x80             -> <Buffer 80 01>
    //   [ 0x81, 0x3fff ] -> <Buffer nn nn>
    //   0x4000           -> <Buffer 80 80 01>
    //   ...
    let array = [];
    for (;;) {
      let shifted = int >> 7;
      if (shifted) {
        array.push(0x80 | (int & 0x7f));
        int = shifted;
      } else {
        array.push(int);
        break;
      }
    }
    return new Buffer(array);
  }

  _processChunk(
    chunk: Buffer,
    encoding: string,
    callback: TransformCallback,
  ): void {
    invariant(this._pushedPublicKey);
    invariant(this._sharedSecret);

    if (!this._randomBytes.length) {
      log.warn(`No random bytes available, waiting`);
      this._bufferedWrites.push({ chunk, encoding, callback });
      return;
    }

    invariant(this._randomBytes.length);

    // Grab random bytes out of our cache, and refill it asynchronously.
    const iv = this._randomBytes.pop();
    this._feedRandomBytes();

    invariant(iv.length === CryptoStreamBase.IV_LENGTH);
    invariant(this._sharedSecret);

    const cipher =
      crypto.createCipheriv(CryptoStreamBase.CIPHER_NAME,
                            this._sharedSecret,
                            iv);

    log.debug(`Sending sequence number 0x` +
              this._sequenceBuffer.toString('hex'));

    const startTime = Date.now();

    cipher.write(this._sequenceBuffer);
    this._sequenceBuffer[0]++;

    cipher.end(chunk, encoding, (error: ?Error) => {
      if (error) {
        this._endWithError(error);
        callback(error);
        return;
      }

      let messageSize = iv.length;

      // Read all data from the cipher stream.
      const encryptedData = [];
      let encrypted = null;

      while ((encrypted = cipher.read())) {
        invariant(typeof encrypted === `object`);
        encryptedData.push(encrypted);
        messageSize += encrypted.length;
      }

      const duration = Date.now() - startTime;

      log.debug(`Sending encrypted message of size ${messageSize}`);
      const messageSizeBuffer = this._encodeInteger(messageSize);

      const dataSize = messageSizeBuffer.length + messageSize;

      const data = Buffer.concat([
        // Send the message size unencrypted.
        messageSizeBuffer,
        // Send the random bytes unencrypted.
        iv,
        // Now send all the encrypted data.
        ...encryptedData,
      ], dataSize);

      this.push(data);
      callback(this._error);

      const plaintextSize = chunk.length + this._sequenceBuffer.length;
      this.emit(`metrics`, new Metrics.Encrypt(plaintextSize, duration));
    });
  }

  _processBufferedChunks(): void {
    invariant(this._pushedPublicKey);
    invariant(this._sharedSecret);

    if (this._bufferedWrites.length) {
      log.debug(`Processing all buffered writes`);

      let bufferedWrites = this._bufferedWrites;
      this._bufferedWrites = [];

      while (bufferedWrites.length) {
        let { chunk, encoding, callback } = bufferedWrites.shift();
        this._processChunk(chunk, encoding, callback);
      }
    }
  }

  _transform(
    chunk: Buffer | string,
    encoding: string,
    callback: TransformCallback,
  ): void {
    invariant(typeof chunk === `object`);
    invariant(chunk.length);
    invariant(encoding === `buffer`);

    if (this._error) {
      callback(this._error);
      return;
    }

    if (!this._pushedPublicKey || !this._sharedSecret) {
      if (!this._pushedPublicKey) {
        log.debug(`Buffering writes until key pair is set`);
      } else {
        log.debug(`Buffering writes until shared secret is set`);
      }
      this._bufferedWrites.push({ chunk, encoding, callback });
      return;
    }

    this._processChunk(chunk, encoding, callback);
  }

  setKeyPair(keyPair: KeyPair): void {
    invariant(!this._pushedPublicKey);
    invariant(!this._sharedSecret);
    invariant(this._bufferedWrites);

    const publicKeyHex = keyPair[1];
    log.debug(`This public key: '${publicKeyHex}'`);

    // We currently only send one byte for the length of the public key. If we
    // ever need more than 255 bytes for the key we will need to change this to
    // take a multi-byte encoded length.
    const publicKey = new Buffer(publicKeyHex, 'hex');
    invariant(publicKey.length <= 0xff);
    const publicKeyLength = new Buffer([publicKey.length]);
    const outgoing = Buffer.concat([publicKeyLength, publicKey]);
    this.push(outgoing);

    this._pushedPublicKey = true;
  }

  get sharedSecret(): ?Buffer {
    return this._sharedSecret;
  }

  set sharedSecret(val: ?Buffer) {
    invariant(val);
    invariant(Buffer.isBuffer(val));
    invariant(!this._sharedSecret);
    invariant(this._bufferedWrites);

    log.debug(`Setting shared secret '${val.toString('hex')}'`);
    this._sharedSecret = val;

    if (this._pushedPublicKey) {
      this._processBufferedChunks();
    }

    this.emit(`sharedSecret`, val);
  }
}

// This class decrypts any data written to it. It requires a key pair at
// construction time. It then expects the public key of the encrypting side to
// be written, from which it calculates the shared secret. Thereafter it will
// be uncorked and data will be decrypted as it is written.
export class DecryptStream extends CryptoStreamBase {

  _bufferedWrites: ?Array<QueuedData> = [];

  _data: Array<Buffer> = [];
  _dataLength: number = 0;

  _encryptedChunkSize: number = 0;
  _decipher: ?crypto$Decipher = null;

  _plaintextSize: number = 0;
  _decryptDuration: number = 0;

  _otherSequenceNumber: ?number = null;

  _keyPair: ?KeyPair = null;
  _otherPublicKeyBuffer: ?Buffer = null;
  _otherPublicKeyBufferIndex: number = 0;

  constructor(options?: DuplexStreamOptions) {
    log.debug(`DecryptStream()`);

    super(options);
  }

  _deriveKey(chunk: Buffer): ?Buffer {
    invariant(!this._sharedSecret);

    const keyPair = this._keyPair;
    invariant(keyPair);

    // If we don't yet have |_otherPublicKeyBuffer| then this is our first chunk
    // of data. The length of the public key will be the first byte.
    if (!this._otherPublicKeyBuffer) {
      log.debug(`Other public key length is ${chunk[0]}`);

      // This should always be true for now...
      if (chunk[0] !== silkCrypto.X25519_KEY_BYTES) {
        const error = new Error(`Invalid public key length (${chunk[0]})`);
        this._endWithError(error);
        return null;
      }

      // Make the buffer that will hold the entire public key.
      this._otherPublicKeyBuffer = new Buffer(chunk[0]);

      // Handle leftover data.
      if (chunk.length > 1) {
        chunk = chunk.slice(1);
      } else {
        // Unlikely, but possible. No point going further here.
        return null;
      }
    }

    const otherPublicKeyBuffer = this._otherPublicKeyBuffer;
    invariant(otherPublicKeyBuffer);

    invariant(this._otherPublicKeyBufferIndex < otherPublicKeyBuffer.length);

    const missingPublicKeyLength =
      otherPublicKeyBuffer.length - this._otherPublicKeyBufferIndex;
    const chunkPublicKeyLength =
      Math.min(missingPublicKeyLength, chunk.length);

    log.debug(`Need ${missingPublicKeyLength} bytes for the public key, ` +
              `received ${chunkPublicKeyLength} bytes for the public key and ` +
              `${chunk.length - chunkPublicKeyLength} bytes left over`);

    let remainingChunk: ?Buffer;

    // Slice out the data that we need for the public key and leave the rest to
    // get processed in |_transform|.
    let publicKeyChunk;
    if (chunkPublicKeyLength === chunk.length) {
      publicKeyChunk = chunk;
      remainingChunk = null;
    } else {
      publicKeyChunk = chunk.slice(0, chunkPublicKeyLength);
      remainingChunk = chunk.slice(chunkPublicKeyLength);
    }

    // Copy all the data that we have received into the public key buffer.
    publicKeyChunk.copy(otherPublicKeyBuffer,
                        this._otherPublicKeyBufferIndex);
    this._otherPublicKeyBufferIndex += publicKeyChunk.length;

    if (this._otherPublicKeyBufferIndex === otherPublicKeyBuffer.length) {
      const theirPublicKeyHex = otherPublicKeyBuffer.toString('hex');
      log.debug(`Received all ${otherPublicKeyBuffer.length} bytes for the ` +
                `public key: '${theirPublicKeyHex}'`);

      const ourSecretKeyHex = keyPair[0];
      silkCrypto.genX25519SharedSecret(ourSecretKeyHex, theirPublicKeyHex)
        .catch((error) => {
          process.nextTick(() => this.emit(`error`, error));
          throw error;
        })
        .then((sharedSecretHex) => {
          // X25519 group size is limited and key distribution is not uniform.
          // To remedy, we hash the resulting shared secret before using it.
          const hasher = crypto.createHash('sha256');
          hasher.update(new Buffer(sharedSecretHex, 'hex'));
          const sharedSecret = this._sharedSecret = hasher.digest();

          // We don't need this any more.
          this._keyPair = null;

          log.debug(`Got shared secret '${sharedSecret.toString('hex')}'`);
          this.emit(`sharedSecret`, sharedSecret);
        })
        .catch((error) => {
          log.error(`Error generating/dispatching shared secret`, error);
        });
    }

    return remainingChunk;
  }

  _decodeEncryptedChunkSize(): boolean {
    // See encoding details above on |_encodeInteger|.
    invariant(this._sharedSecret);
    invariant(!this._encryptedChunkSize);

    if (!this._dataLength) {
      return false;
    }

    let dataIndex = 0;
    let bufferIndex = 0;
    let shiftCount = 0;
    let result = 0;

    for (;;) {
      let buffer = this._data[dataIndex];
      let byte = buffer[bufferIndex++];

      result += ((byte & 0x7f) << shiftCount);
      shiftCount += 7;

      if (!(byte & 0x80)) {
        break;
      }

      if (bufferIndex === buffer.length) {
        // That was the end of this buffer. Move on to the next one.
        dataIndex++;
        bufferIndex = 0;

        if (dataIndex === this._data.length) {
          // That was our last buffer, not enough to decode the count. Don't
          // modify anything so that we can try again next time.
          return false;
        }
      }
    }

    log.debug(`Receiving encrypted message of size ${result}`);

    // Remove any completely consumed buffers.
    while (dataIndex--) {
      let consumed = this._data.shift();
      this._dataLength -= consumed.length;
    }

    // Take care of any partially consumed buffer.
    if (bufferIndex) {
      if (this._data[0].length === bufferIndex) {
        // Don't slice if we completely consumed this buffer, just remove it.
        this._data.shift();
      } else {
        this._data[0] = this._data[0].slice(bufferIndex);
      }
      this._dataLength -= bufferIndex;
    }

    if (result < CryptoStreamBase.IV_LENGTH) {
      const error =
        new Error(`Message is too small: ${this._encryptedChunkSize}`);
      this._endWithError(error);
      return false;
    }

    this._encryptedChunkSize = result;
    return true;
  }

  _createDecipher(): boolean {
    invariant(!this._decipher);
    invariant(!this._plaintextSize);
    invariant(!this._decryptDuration);

    const sharedSecret = this._sharedSecret;
    invariant(sharedSecret);

    if (this._dataLength < CryptoStreamBase.IV_LENGTH) {
      return false;
    }

    let iv = new Buffer(CryptoStreamBase.IV_LENGTH);
    let ivIndex = 0;

    let remaining = iv.length;

    for (;;) {
      let buffer = this._data[0];

      if (buffer.length <= remaining) {
        this._data.shift();
      }

      if (buffer.length < remaining) {
        buffer.copy(iv, ivIndex);
        ivIndex += buffer.length;
        remaining -= buffer.length;
      } else {
        if (buffer.length > remaining) {
          buffer.slice(0, remaining).copy(iv, ivIndex);
          this._data[0] = buffer.slice(remaining);
        } else {
          buffer.copy(iv, ivIndex);
        }
        break;
      }
    }

    this._dataLength -= iv.length;
    this._encryptedChunkSize -= iv.length;

    log.debug(`Creating decipher`);

    const decipher =
      crypto.createDecipheriv(CryptoStreamBase.CIPHER_NAME, sharedSecret, iv);

    let firstData = true;

    decipher.addListener(`data`, data => {
      this._plaintextSize += data.length;

      if (firstData) {
        firstData = false;

        if (this._otherSequenceNumber !== null) {
          const expectedSequenceNumber =
            (this._otherSequenceNumber + 1) % 0x100;
          if (expectedSequenceNumber !== data[0]) {
            this._endWithError(new Error(`Sequence mismatch, packets dropped`));
            return;
          }
        }

        log.debug(`Received sequence number 0x${data[0].toString(16)}`);
        this._otherSequenceNumber = data[0];

        if (data.length === 1) {
          // Nothing left to push.
          return;
        }

        data = data.slice(1);
      }

      this.push(data);
    });

    decipher.addListener(`error`, error => {
      this._endWithError(error);
    });

    decipher.once(`end`, () => {
      log.debug(`Finished decrypting message`);
      decipher.removeAllListeners();
    });

    this._decipher = decipher;
    return true;
  }

  _pushEncryptedData(): boolean {
    invariant(this._sharedSecret);

    const decipher = this._decipher;
    invariant(decipher);

    const sizeToPush = Math.min(this._dataLength, this._encryptedChunkSize);
    if (!sizeToPush) {
      return false;
    }

    let remaining = sizeToPush;

    const start = Date.now();

    while (remaining) {
      let buffer = this._data[0];
      if (buffer.length < remaining) {
        decipher.write(this._data.shift());
        remaining -= buffer.length;
      } else {
        if (buffer.length > remaining) {
          decipher.write(buffer.slice(0, remaining));
          this._data[0] = buffer.slice(remaining);
        } else {
          decipher.write(this._data.shift());
        }
        break;
      }
    }

    this._decryptDuration += Date.now() - start;

    this._dataLength -= sizeToPush;
    this._encryptedChunkSize -= sizeToPush;

    return true;
  }

  _pushNextMessage(): boolean {
    if (!this._dataLength) {
      return false;
    }

    if (!this._encryptedChunkSize && !this._decodeEncryptedChunkSize()) {
      // Not enough data to calculate count, wait until we get more data.
      return false;
    }

    invariant(this._encryptedChunkSize);

    if (!this._decipher && !this._createDecipher()) {
      // Not enough data to create the decipher.
      return false;
    }

    this._pushEncryptedData();

    if (this._encryptedChunkSize) {
      return false;
    }

    const start = Date.now();

    invariant(this._decipher);
    this._decipher.end();

    const duration = Date.now() - start + this._decryptDuration;
    const plaintextSize = this._plaintextSize;

    this._decipher = null;
    this._plaintextSize = 0;
    this._decryptDuration = 0;

    // This method can be called in a loop and the metrics aren't perf-critical
    // so just do this on the next tick.
    process.nextTick(() => {
      this.emit(`metrics`, new Metrics.Decrypt(plaintextSize, duration));
    });

    return true;
  }

  _processChunk(
    chunk: Buffer,
    encoding: string,
    callback: TransformCallback,
  ): void {
    invariant(chunk);
    invariant(chunk.length);
    invariant(encoding === `buffer`);

    if (this._error) {
      callback(this._error);
      return;
    }

    let remainingChunk: ?Buffer = chunk;

    if (!this._sharedSecret) {
      remainingChunk = this._deriveKey(chunk);
      if (!remainingChunk) {
        callback(this._error);
        return;
      }

      invariant(this._sharedSecret);
    }

    invariant(remainingChunk);

    this._data.push(remainingChunk);
    this._dataLength += remainingChunk.length;

    while (this._pushNextMessage()) {            // eslint-disable-line no-empty
      // Push as many messages as possible.
    }

    callback(this._error);
  }

  _transform(
    chunk: Buffer | string,
    encoding: string,
    callback: TransformCallback,
  ): void {
    invariant(typeof chunk === `object`);
    invariant(chunk.length);
    invariant(encoding === `buffer`);

    if (this._error) {
      callback(this._error);
      return;
    }

    if (!this._sharedSecret && !this._keyPair) {
      log.debug(`Buffering writes until key pair is set`);
      invariant(this._bufferedWrites);
      this._bufferedWrites.push({ chunk, encoding, callback });
      return;
    }

    this._processChunk(chunk, encoding, callback);
  }

  setKeyPair(keyPair: KeyPair): void {
    invariant(keyPair);
    invariant(!this._keyPair);

    const bufferedWrites = this._bufferedWrites;
    invariant(bufferedWrites);

    log.debug(`Setting key pair`);

    this._keyPair = keyPair;

    if (bufferedWrites.length) {
      log.debug(`Processing buffered writes`);

      while (bufferedWrites.length) {
        let { chunk, encoding, callback } = bufferedWrites.shift();
        this._processChunk(chunk, encoding, callback);
      }
    }

    this._bufferedWrites = null;
  }

  get sharedSecret(): ?Buffer {
    return this._sharedSecret;
  }
}

export class CryptoDuplexStream extends DuplexTransform {

  _sharedSecret = null;

  constructor(
    stream: Duplex,
    options?: {autoClose?: boolean} = {},
  ) {
    log.debug(`CryptoDuplexStream()`);

    const decrypt = new DecryptStream();
    const encrypt = new EncryptStream();

    options = {...options};
    if (!(`autoClose` in options)) {
      options.autoClose = true;
    }

    super(stream, stream, decrypt, encrypt, options);

    decrypt.once(`sharedSecret`, (sharedSecret) => {
      encrypt.sharedSecret = sharedSecret;
    });

    encrypt.once(`sharedSecret`, sharedSecret => {
      this._sharedSecret = sharedSecret;
      this.emit(`sharedSecret`, sharedSecret);
    });

    silkCrypto.genX25519KeyPair().then((keyPair) => {
      encrypt.setKeyPair(keyPair);
      decrypt.setKeyPair(keyPair);
    }).catch((error) => {
      log.error(`Could not generate key pair`, error);
      process.nextTick(() => {
        this.emit(`error`, error);
      });
    });
  }

  get sharedSecret(): ?Buffer {
    return this._sharedSecret;
  }

}
