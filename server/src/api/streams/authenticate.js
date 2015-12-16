/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import assert from 'assert';
import ClosingTransform from './closing_transform';
import { CryptoDuplexStream } from './crypto';
import { DuplexTransform } from './duplex_transform';
import Id from '../id';
import makeLog from 'log';

const log = makeLog(`api-streams-authenticate`);

const PROPERTY_NAME = `_0--"_`;

class AuthenticateStreamBase extends ClosingTransform {

  _authenticated = false;
  _allowUnauthenticated = false;
  _ending = false;
  _queue = [ ];

  constructor(cryptoStream, options = { }) {
    log.debug(`AuthenticateStreamBase()`);

    assert(cryptoStream);
    assert(cryptoStream.constructor === CryptoDuplexStream);

    options = Object.assign({ }, options);
    if (!(`objectMode` in options)) {
      options.objectMode = true;
    }

    super(options);

    cryptoStream.once(`sharedSecret`, (secret) => this._onSharedSecret(secret));
  }

  _queueOrPush(chunk) {
    if (this._queue) {
      this._queue.push(chunk);
    } else {
      this.push(chunk);
    }
  }

  _setAuthenticated(callback = null) {
    log.debug(`AuthenticateStreamBase._setAuthenticated()`);

    assert(!this._authenticated);
    assert(!this._allowUnauthenticated);
    assert(this._queue);

    this._authenticated = true;
    this.emit(`authenticated`);

    this._releaseQueue(callback);
  }

  _discardQueue() {
    log.debug(`AuthenticateStreamBase._discardQueue()`);

    this._queue = null;
  }

  _releaseQueue(callback = null) {
    log.debug(`AuthenticateStreamBase._releaseQueue()`);

    let queue = this._queue;
    this._queue = null;

    assert(queue);

    let error;

    if (this._ending) {
      error = new Error(`Stream ended, cannot push queued data`);
      log.warn(error);
    } else {
      error = null;
      queue.forEach((queued) => {
        this.push(queued);
      });
    }

    if (callback) {
      callback(error);
    }
  }

  _isAuthChunk(chunk) {
    return chunk && (typeof chunk === `object`) && (PROPERTY_NAME in chunk);
  }

  _onSharedSecret(/* sharedSecret */) {
    assert(false, `Subclasses must override _onSharedSecret`);
  }

  end(chunk, encoding, callback) {
    log.debug(`[${this.constructor.name}] AuthenticateStreamBase.end()`);

    this._ending = true;

    if (!this._queue) {
      super.end(chunk, encoding, callback);
      return;
    }

    log.warn(`Stream ended with queued data`);
    this._discardQueue();

    super.end(callback);
  }

  allowUnauthenticated() {
    log.debug(`AuthenticateStreamBase.allowUnauthenticated()`);

    assert(!this._authenticated);

    if (this._allowUnauthenticated) {
      log.warn(`allowUnauthenticated() called more than once`);
      assert(!this._queue);
      return;
    }

    this._allowUnauthenticated = true;

    this._releaseQueue();
  }

  get authenticated() {
    return this._authenticated;
  }
}

export class AuthenticateReadStream extends AuthenticateStreamBase {

  _publicKeys = null;
  _sessionKey = ``;
  _authData = null;
  _authError = null;

  constructor(cryptoStream, publicKeys, options) {
    log.debug(`AuthenticateReadStream()`);

    assert(publicKeys);
    if (!Array.isArray(publicKeys)) {
      publicKeys = [ publicKeys ];
    }
    for (let publicKey of publicKeys) {
      assert(typeof publicKey === `string`);
    }

    super(cryptoStream, options);

    this._publicKeys = publicKeys;
  }

  _transform(chunk, encoding, callback) {
    // It's assumed that the crypto stream won't allow any data though until it
    // has figured out its shared secret.
    assert(this._sessionKey);

    if (this._authError) {
      // Previous failures effectively kill this stream.
      callback(this._authError);
      return;
    }

    if (!this._isAuthChunk(chunk)) {
      this._queueOrPush(chunk);
      callback(null);
      return;
    }

    // Auth chunks never get pushed into the stream.

    const authData = chunk[PROPERTY_NAME];

    if (authData === null) {
      log.info(`Receiving unauthenticated data`);

      if (!this._allowUnauthenticated) {
        // Emit an event and see if unauthenticated access is allowed.
        this.emit(`unauthenticated`);
        if (!this._allowUnauthenticated) {
          this._authError =
            new Error(`Unauthenticated data was not explicitly allowed`);
          log.warn(this._authError);

          this._discardQueue();
        }
      }

      callback(this._authError);
      return;
    }

    if (this._authenticated) {
      log.warn(`Already authenticated`);
      callback(this._authError);
      return;
    }

    if (this._allowUnauthenticated) {
      log.info(`Received auth data but ignoring because we're running in ` +
               `unauthenticated mode`);
      callback(this._authError);
      return;
    }

    this._authError = this._verify(authData);

    // No need to hang on to these any more.
    this._publicKeys = null;

    if (this._authError) {
      log.warn(this._authError);
      this._discardQueue();
      callback(this._authError);
      return;
    }

    this._setAuthenticated(callback);
  }

  _verify(authData) {
    log.debug(`AuthenticateReadStream._verify('${authData}')`);

    assert(!this._authenticated);
    assert(this._publicKeys);
    assert(this._sessionKey);

    if (!authData || (typeof authData !== `string`)) {
      return new Error(`Auth data malformed: ` + JSON.stringify(authData));
    }

    if (!this._publicKeys.length) {
      return new Error(`No public keys available`);
    }

    let verified = false;
    for (let publicKey of this._publicKeys) {
      log.debug(`Attempting to verify signature with '${publicKey}'`);

      let id = Id.importPub(publicKey);
      if (id.verify(this._sessionKey, authData)) {
        log.debug(`Signature verified`);
        verified = true;
        break;
      }
    }

    if (!verified) {
      return new Error(`Auth signature could not be verified`);
    }

    return null;
  }

  _onSharedSecret(sharedSecret) {
    log.debug(`AuthenticateReadStream._onSharedSecret()`);

    if (this._sessionKey) {
      log.warn(`Received shared secret more than once`);
      return;
    }

    this._sessionKey = sharedSecret.toString(`hex`);
  }

  allowUnauthenticated() {
    log.debug(`AuthenticateReadStream.allowUnauthenticated()`);

    super.allowUnauthenticated();

    this._publicKeys = null;
  }
}

export class AuthenticateWriteStream extends AuthenticateStreamBase {

  _privateKey = null;

  constructor(cryptoStream, privateKey, options) {
    log.debug(`AuthenticateWriteStream()`);

    assert(privateKey);
    assert(typeof privateKey === `string`);

    super(cryptoStream, options);

    this._privateKey = new Id(null, privateKey);
  }

  _transform(chunk, encoding, callback) {
    // Make sure auth messages don't come through the normal write pipe.
    assert(!this._isAuthChunk(chunk));

    this._queueOrPush(chunk);
    callback(null);
  }

  _onSharedSecret(sharedSecret) {
    log.debug(`AuthenticateWriteStream._onSharedSecret()`);

    if (!this._privateKey) {
      return;
    }

    this._sendAuthData(sharedSecret.toString(`hex`));
  }

  _sendAuthData(authData) {
    log.debug(`AuthenticateWriteStream._sendAuthData(%j)`, authData);

    assert(this._privateKey);

    const privateKey = this._privateKey;
    this._privateKey = null;

    if (this._ending) {
      log.warn(`Cannot send auth data because the stream has ended`);
      return;
    }

    let message = { };
    message[PROPERTY_NAME] = authData ? privateKey.sign(authData) : null;
    this.push(message);
  }

  allowUnauthenticated() {
    log.debug(`AuthenticateWriteStream.allowUnauthenticated()`);

    assert(!this._authenticated);

    if (this._privateKey) {
      log.info(`Sending unauthenticated data`);
      this._sendAuthData(null);
    }

    super.allowUnauthenticated();
  }
}

export class AuthenticateDuplexStream extends DuplexTransform {

  __reader = null;
  __writer = null;

  constructor(wrappedStream,
              cryptoStream,
              privateKey,
              publicKeys,
              options = { }) {
    log.debug(`AuthenticateDuplexStream()`);

    const reader =
      new AuthenticateReadStream(cryptoStream, publicKeys, options);
    const writer =
      new AuthenticateWriteStream(cryptoStream, privateKey, options);

    options = Object.assign({ }, options);
    if (!(`objectMode` in options)) {
      options.objectMode = true;
    }
    if (!(`autoClose` in options)) {
      options.autoClose = true;
    }

    super(wrappedStream, wrappedStream, reader, writer, options);

    reader.once(`authenticated`, () => writer._setAuthenticated());
    reader.once(`unauthenticated`, () => this.emit(`unauthenticated`));

    this.__reader = reader;
    this.__writer = writer;
  }

  allowUnauthenticated() {
    log.info(`Allowing unauthenticated data`);
    this.__reader.allowUnauthenticated();
    this.__writer.allowUnauthenticated();
  }

  get authenticated() {
    assert(this.__reader.authenticated === this.__writer.authenticated);
    return this.__reader.authenticated;
  }
}
