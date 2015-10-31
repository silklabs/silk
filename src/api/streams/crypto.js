/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import crypto from 'crypto';
import { DuplexTransform } from './duplex_transform';
import { ec as EC } from 'elliptic';
import makeLog from 'log';
import { Transform } from 'stream';

const log = makeLog(`api-streams-crypto`);

// By default we'll try to use whatever is on |crypto| for our source of entropy
// but Browserify/ReactNative don't provide that so we need to pass this in
// sometimes.
let getRandomBytes = crypto.randomBytes;

export function setRandomBytesFunction(func) {
  assert(func);
  assert(typeof func === `function`);

  getRandomBytes = func;
}

class CryptoStreamBase extends Transform {
  static CURVE_NAME = `curve25519`;
  static CIPHER_NAME = `aes-256-cbc`;
  static HASH_NAME = `sha256`;
  static PUBLIC_KEY_LENGTH = 32;
  static IV_LENGTH = 16;

  _ec = null;
  _sharedSecret = null;
  _error = null;

  constructor(ec, options) {
    log.debug(`CryptoStreamBase()`);

    super(options);

    this._ec = ec;
  }

  _endWithError(error) {
    log.debug(`CryptoStreamBase._endWithError('${error.toString()}')`);

    this.emit(`error`, error);

    if (this._error) {
      log.warn(error);
    } else {
      this._error = error;
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
  _bufferedWrites = [ ];
  _sequenceBuffer = null;
  _randomBytes = [ ];
  _pushedPublicKey = false;

  constructor(ec, options) {
    log.debug(`EncryptStream()`);

    super(ec, options);

    // Our sequence counter is just a single byte.
    this._sequenceBuffer = new Buffer([this._insecureRandomInt(0, 0xff)]);

    // Queue up several chunks of random bytes so that we are less likely to
    // block when sending data later.
    for (let index = 0; index < 5; index++) {
      getRandomBytes(CryptoStreamBase.IV_LENGTH, this._onRandomBytes);
    }
  }

  _insecureRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _onRandomBytes = (error, random) => {
    if (error) {
      this._endWithError(error);
    } else {
      this._randomBytes.push(random);

      if (this._pushedPublicKey &&
          this._sharedSecret &&
          this._bufferedWrites.length) {
        const { data, encoding, callback } = this._bufferedWrites.shift();
        this._processChunk(data, encoding, callback);
      }
    }
  };

  _encodeInteger(int) {
    // Each byte can hold 7 bits, and the high bit is used to indicate that the
    // value continues in the next byte.
    // E.g.:
    //   [ 0x00, 0x7f ]   -> <Buffer nn>
    //   0x80             -> <Buffer 80 01>
    //   [ 0x81, 0x3fff ] -> <Buffer nn nn>
    //   0x4000           -> <Buffer 80 80 01>
    //   ...
    let array = [ ];
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

  _processChunk(chunk, encoding, callback) {
    assert(this._pushedPublicKey);
    assert(this._sharedSecret);

    if (!this._randomBytes.length) {
      log.warn(`No random bytes available, waiting`);
      this._bufferedWrites.push({ chunk, encoding, callback });
      return;
    }

    assert(this._randomBytes.length);

    // Grab random bytes out of our cache, and refill it asynchronously.
    const random = this._randomBytes.pop();
    getRandomBytes(CryptoStreamBase.IV_LENGTH, this._onRandomBytes);

    const cipher =
      crypto.createCipheriv(CryptoStreamBase.CIPHER_NAME,
                            this._sharedSecret,
                            random);

    log.debug(`Sending sequence number 0x` +
              this._sequenceBuffer.toString('hex'));

    cipher.write(this._sequenceBuffer);
    this._sequenceBuffer[0]++;

    cipher.end(chunk, encoding, error => {
      if (error) {
        this._endWithError(error);
        callback(error);
        return;
      }

      let encryptedData = [ ];
      let messageSize = CryptoStreamBase.IV_LENGTH;

      // Read all data from the cipher stream.
      let data = null;
      while ((data = cipher.read())) {
        encryptedData.push(data);
        messageSize += data.length;
      }

      log.debug(`Sending encrypted message of size ${messageSize}`);

      // Send the message size unencrypted.
      this.push(this._encodeInteger(messageSize));

      log.debug(`Sending random bytes`, random);

      // Send the random bytes unencrypted.
      this.push(random);

      // Now send all the encoded data.
      for (let encrypted of encryptedData) {
        this.push(encrypted);
      }

      callback(this._error);
    });
  }

  _processBufferedChunks() {
    assert(this._pushedPublicKey);
    assert(this._sharedSecret);

    if (this._bufferedWrites.length) {
      log.debug(`Processing all buffered writes`);

      let bufferedWrites = this._bufferedWrites;
      this._bufferedWrites = [ ];

      while (bufferedWrites.length) {
        let { chunk, encoding, callback } = bufferedWrites.shift();
        this._processChunk(chunk, encoding, callback);
      }
    }
  }

  _transform(chunk, encoding, callback) {
    assert(chunk.length);
    assert(encoding === `buffer`);

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

  setKeyPair(keyPair) {
    assert(!this._pushedPublicKey);
    assert(!this._sharedSecret);
    assert(this._bufferedWrites);

    // Elliptic always returns an array if anything other than 'hex' is passed.
    const publicKeyArray = keyPair.getPublic(true, 'binary');
    assert(Array.isArray(publicKeyArray));

    // For now this will always be a constant length.
    assert(publicKeyArray.length === CryptoStreamBase.PUBLIC_KEY_LENGTH);

    // We currently only send one byte for the length of the public key. If we
    // ever need more than 255 bytes for the key we will need to change this to
    // take a multi-byte encoded length.
    assert(publicKeyArray.length <= 0xff);

    // The first data sent contains the public key length followed by the public
    // key.
    let outgoing = new Buffer(publicKeyArray.length + 1);
    outgoing[0] = publicKeyArray.length;

    // Copy the public key into the buffer.
    for (let i = 0; i < publicKeyArray.length; i++) {
      outgoing[i + 1] = publicKeyArray[i];
    }

    log.debug(`This public key: '${outgoing.slice(1).toString('hex')}'`);
    this.push(outgoing);

    this._pushedPublicKey = true;
  }

  get sharedSecret() {
    return this._sharedSecret;
  }

  set sharedSecret(val) {
    assert(Buffer.isBuffer(val));
    assert(!this._sharedSecret);
    assert(this._bufferedWrites);

    log.debug(`Setting shared secret`, val);
    this._sharedSecret = val;

    if (this._pushedPublicKey) {
      this._processBufferedChunks();
    }
  }
}

// This class decrypts any data written to it. It requires a key pair at
// construction time. It then expects the public key of the encrypting side to
// be written, from which it calculates the shared secret. Thereafter it will
// be uncorked and data will be decrypted as it is written.
export class DecryptStream extends CryptoStreamBase {
  _bufferedWrites = [ ];

  _data = [ ];
  _dataLength = 0;

  _encryptedChunkSize = 0;
  _decipher = null;

  _otherSequenceNumber = undefined;

  _keyPair = null;
  _otherPublicKeyBuffer = null;
  _otherPublicKeyBufferIndex = 0;

  constructor(ec, options) {
    log.debug(`DecryptStream()`);

    super(ec, options);
  }

  _deriveKey(chunk) {
    assert(this._keyPair);
    assert(!this._sharedSecret);
    assert(Buffer.isBuffer(chunk));

    // If we don't yet have |_otherPublicKeyBuffer| then this is our first chunk
    // of data. The length of the public key will be the first byte.
    if (!this._otherPublicKeyBuffer) {
      log.debug(`Other public key length is ${chunk[0]}`);

      // This should always be true for now...
      if (chunk[0] !== CryptoStreamBase.PUBLIC_KEY_LENGTH) {
        const error = new Error(`Invalid public key length (${chunk[0]})`);
        this._endWithError(error);
        return;
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

    assert(this._otherPublicKeyBufferIndex < this._otherPublicKeyBuffer.length);

    const missingPublicKeyLength =
      this._otherPublicKeyBuffer.length - this._otherPublicKeyBufferIndex;
    const chunkPublicKeyLength =
      Math.min(missingPublicKeyLength, chunk.length);

    log.debug(`Need ${missingPublicKeyLength} bytes for the public key, ` +
              `received ${chunkPublicKeyLength} bytes for the public key and ` +
              `${chunk.length - chunkPublicKeyLength} bytes left over`);

    // Slice out the data that we need for the public key and leave the rest to
    // get processed in |_transform|.
    let publicKeyChunk;
    if (chunkPublicKeyLength == chunk.length) {
      publicKeyChunk = chunk;
      chunk = null;
    } else {
      publicKeyChunk = chunk.slice(0, chunkPublicKeyLength);
      chunk = chunk.slice(chunkPublicKeyLength);
    }

    // Copy all the data that we have received into the public key buffer.
    publicKeyChunk.copy(this._otherPublicKeyBuffer,
                        this._otherPublicKeyBufferIndex);
    this._otherPublicKeyBufferIndex += publicKeyChunk.length;

    if (this._otherPublicKeyBufferIndex == this._otherPublicKeyBuffer.length) {
      log.debug(`Received all ${this._otherPublicKeyBuffer.length} bytes for ` +
                `the public key: ` +
                `'${this._otherPublicKeyBuffer.toString('hex')}'`);

      // Do the shared secret derivation.
      const otherKeyPair = this._ec.keyFromPublic(this._otherPublicKeyBuffer);

      // We don't need this any more.
      this._otherPublicKeyBuffer = null;
      this._otherPublicKeyBufferIndex = 0;

      const otherPublicKey = otherKeyPair.getPublic();
      const derived = this._keyPair.derive(otherPublicKey).toArray(`le`);

      // We don't need this any more.
      this._keyPair = null;

      const hasher = crypto.createHash(CryptoStreamBase.HASH_NAME);
      hasher.update(new Buffer(derived));
      this._sharedSecret = hasher.digest();

      log.debug('Got shared secret', this._sharedSecret);
      this.emit(`sharedSecret`, this._sharedSecret);
    }

    return chunk;
  }

  _decodeEncryptedChunkSize() {
    // See encoding details above on |_encodeInteger|.
    assert(this._sharedSecret);
    assert(!this._encryptedChunkSize);

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

  _createDecipher() {
    assert(this._sharedSecret);
    assert(!this._decipher);

    if (this._dataLength < CryptoStreamBase.IV_LENGTH) {
      return false;
    }

    let random = new Buffer(CryptoStreamBase.IV_LENGTH);
    let randomIndex = 0;

    let remaining = random.length;

    for (;;) {
      let buffer = this._data[0];

      if (buffer.length <= remaining) {
        this._data.shift();
      }

      if (buffer.length < remaining) {
        buffer.copy(random, randomIndex);
        randomIndex += buffer.length;
        remaining -= buffer.length;
      } else {
        if (buffer.length > remaining) {
          buffer.slice(0, remaining).copy(random, randomIndex);
          this._data[0] = buffer.slice(remaining);
        } else {
          buffer.copy(random, randomIndex);
        }
        break;
      }
    }

    this._dataLength -= random.length;
    this._encryptedChunkSize -= random.length;

    log.debug(`Creating decipher with the first ${random.length} bytes`,
              random);

    const decipher =
      crypto.createDecipheriv(CryptoStreamBase.CIPHER_NAME,
                              this._sharedSecret,
                              random);

    let firstData = true;

    decipher.addListener(`data`, data => {
      if (firstData) {
        firstData = false;

        if (this._otherSequenceNumber !== undefined) {
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

  _pushEncryptedData() {
    assert(this._sharedSecret);
    assert(this._decipher);

    const sizeToPush = Math.min(this._dataLength, this._encryptedChunkSize);
    if (!sizeToPush) {
      return false;
    }

    let remaining = sizeToPush;

    while (remaining) {
      let buffer = this._data[0];
      if (buffer.length < remaining) {
        this._decipher.write(this._data.shift());
        remaining -= buffer.length;
      } else {
        if (buffer.length > remaining) {
          this._decipher.write(buffer.slice(0, remaining));
          this._data[0] = buffer.slice(remaining);
        } else {
          this._decipher.write(this._data.shift());
        }
        break;
      }
    }

    this._dataLength -= sizeToPush;
    this._encryptedChunkSize -= sizeToPush;

    return true;
  }

  _pushNextMessage() {
    if (!this._dataLength) {
      return false;
    }

    if (!this._encryptedChunkSize && !this._decodeEncryptedChunkSize()) {
      // Not enough data to calculate count, wait until we get more data.
      return false;
    }

    assert(this._encryptedChunkSize);

    if (!this._decipher && !this._createDecipher()) {
      // Not enough data to create the decipher.
      return false;
    }

    assert(this._decipher);

    this._pushEncryptedData();

    if (this._encryptedChunkSize) {
      return false;
    }

    this._decipher.end();
    this._decipher = null;

    return true;
  }

  _processChunk(chunk, encoding, callback) {
    assert(chunk.length);
    assert(encoding === `buffer`);

    if (this._error) {
      callback(this._error);
      return;
    }

    if (!this._sharedSecret) {
      chunk = this._deriveKey(chunk);
      if (!chunk) {
        callback(this._error);
        return;
      }

      assert(this._sharedSecret);
    }

    this._data.push(chunk);
    this._dataLength += chunk.length;

    while (this._pushNextMessage()) {            // eslint-disable-line no-empty
      // Push as many messages as possible.
    }

    callback(this._error);
  }

  _transform(chunk, encoding, callback) {
    assert(chunk.length);
    assert(encoding === `buffer`);

    if (this._error) {
      callback(this._error);
      return;
    }

    if (!this._sharedSecret && !this._keyPair) {
      log.debug(`Buffering writes until key pair is set`);
      this._bufferedWrites.push({ chunk, encoding, callback });
      return;
    }

    this._processChunk(chunk, encoding, callback);
  }

  setKeyPair(keyPair) {
    assert(keyPair);
    assert(!this._keyPair);
    assert(this._bufferedWrites);

    log.debug(`Setting key pair`);

    this._keyPair = keyPair;

    if (this._bufferedWrites.length) {
      log.debug(`Processing buffered writes`);

      while (this._bufferedWrites.length) {
        let { chunk, encoding, callback } = this._bufferedWrites.shift();
        this._processChunk(chunk, encoding, callback);
      }
    }

    this._bufferedWrites = null;
  }

  get sharedSecret() {
    return this._sharedSecret;
  }
}

export class CryptoDuplexStream extends DuplexTransform {
  constructor(stream, options) {
    log.debug(`CryptoDuplexStream()`);

    const ec = new EC(CryptoStreamBase.CURVE_NAME);

    const decrypt = new DecryptStream(ec);
    const encrypt = new EncryptStream(ec);

    const randomByteCountNeeded = ec.hash.hmacStrength;
    assert(randomByteCountNeeded);

    getRandomBytes(randomByteCountNeeded, (error, bytes) => {
      if (error) {
        log.error(error);
        this.push(null);
        return;
      }

      const keyPair = ec.genKeyPair({ entropy: bytes });
      encrypt.setKeyPair(keyPair);
      decrypt.setKeyPair(keyPair);
    });

    decrypt.once(`sharedSecret`, sharedSecret => {
      encrypt.sharedSecret = sharedSecret;
    });

    super(stream, stream, decrypt, encrypt, options);
  }
}
