/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'invariant';
import {AccessToken} from 'silk-api';
import createLog from 'silk-log';

import ClosingTransform from './closing_transform';
import {CryptoDuplexStream} from './crypto';
import DuplexTransform from './duplex_transform';
import * as Metrics from './metrics';

import type {Duplex} from 'stream';
import type {DuplexStreamOptions} from 'silk-streams';

type TransformCallback = (error: ?Error, data?: Buffer | string) => void;

type Deferred<T> = {
  promise: Promise<T>,
  accept: (value: Promise<T> | T) => void,
  reject: (error: any) => void,
};

const PROPERTY_NAME = `_0--"_`;

function isAuthData(data: Object): boolean {
  return data && (typeof data === `object`) && (PROPERTY_NAME in data);
}

function createDeferred<T>(): Deferred<T> {
  const deferred = {};
  deferred.promise = new Promise((accept, reject) => {
    deferred.accept = accept;
    deferred.reject = reject;
  });
  return deferred;
}

export class AuthenticateStreamBase extends ClosingTransform {

  static log = createLog(`streams:authenticate-base`);

  _onSharedSecret: ((sharedSecret: Buffer) => void);

  _blocked: boolean = true;
  _transformData: ?Object = null;
  _transformCallback: ?TransformCallback = null;
  _allowUnauthenticatedDeferred: Deferred<boolean> = createDeferred();

  _error: ?Error = null;

  constructor(
    cryptoStream: CryptoDuplexStream,
    options: ?DuplexStreamOptions,
  ) {
    AuthenticateStreamBase.log.debug(`constructor`);

    invariant(cryptoStream);
    invariant(cryptoStream.constructor === CryptoDuplexStream);

    options = Object.assign({}, options);
    if (!(`objectMode` in options)) {
      options.objectMode = true;
    }

    super(options);

    cryptoStream.once(`sharedSecret`, (secret) => this._onSharedSecret(secret));
  }

  _setError(error: Error): void {
    AuthenticateStreamBase.log.debug(`_setError`, error);

    if (this._error) {
      AuthenticateStreamBase.log.warn(`Multiple errors`, error);
      invariant(!this._blocked);
      return;
    }

    this._error = error;

    // Use the stream callback to signal the error if we can. Otherwise do it
    // manually on the next tick.
    if (this._transformCallback === null) {
      process.nextTick(() => this.emit(`error`, error));
    }

    if (this._blocked) {
      this._unblock();
    }
  }

  _unblock(): void {
    AuthenticateStreamBase.log.debug(`_unblock`);

    if (!this._blocked) {
      return;
    }
    this._blocked = false;

    const data = this._transformData;
    this._transformData = null;

    const callback = this._transformCallback;
    this._transformCallback = null;

    if (callback) {
      callback(this._error, data);
    }
  }

  allowUnauthenticated(allow: boolean): void {
    AuthenticateStreamBase.log.debug(`allowUnauthenticated`, allow);

    this._allowUnauthenticatedDeferred.accept(allow);
  }

}

export class AuthenticateReadStream extends AuthenticateStreamBase {

  static log = createLog(`streams:authenticate-read`);

  _publicKeys: ?Array<string> = null;
  _sharedSecret: ?string = null;
  _authenticated: boolean = false;
  _receivedAuthData: boolean = false;

  constructor(
    cryptoStream: CryptoDuplexStream,
    publicKeys: Array<string>,
    options?: DuplexStreamOptions,
  ) {
    AuthenticateReadStream.log.debug(`constructor`);

    invariant(publicKeys);
    invariant(Array.isArray(publicKeys));
    publicKeys.forEach((publicKey) => invariant(typeof publicKey === `string`));

    super(cryptoStream, options);

    this._publicKeys = publicKeys;
  }

  _transform(
    data: Buffer | string,
    encoding: string,
    callback: ((error: ?Error, data?: Buffer | string) => void)
  ): void {
    invariant(!this._transformData);
    invariant(!this._transformCallback);

    if (this._error) {
      // Previous failures effectively kill this stream.
      callback(this._error);
      return;
    }

    if (!this._sharedSecret) {
      // It's assumed that the crypto stream won't allow any data though until
      // it has figured out its shared secret.
      this._setError(new Error(`Received data before shared secret`));
      callback(this._error);
      return;
    }

    invariant(typeof data === 'object');

    if (!isAuthData(data)) {
      if (this._blocked) {
        AuthenticateReadStream.log.debug(`Waiting to be unblocked`);
        this._transformData = data;
        this._transformCallback = callback;
      } else {
        callback(this._error, data);
      }
      return;
    }

    if (this._receivedAuthData) {
      this._setError(new Error(`Received multiple auth messages`));
      callback(this._error);
      return;
    }

    this._receivedAuthData = true;

    invariant(!this._authenticated);

    // Auth data never get pushed into the stream.
    const authData: string = data[PROPERTY_NAME];
    if ((typeof authData !== 'string') || !authData.length) {
      const message = `Malformed auth message`;
      AuthenticateReadStream.log.warn(message, data);

      this._setError(new Error(message));
      callback(this._error);
      return;
    }

    this._verify(authData, callback);
  }

  async _verify(authData: string, callback: TransformCallback): Promise<void> {
    AuthenticateReadStream.log.debug(`verify`, authData);

    invariant(this._publicKeys);
    invariant(this._sharedSecret);
    invariant(!this._authenticated);

    try {
      await this._verifyInternal(authData);
    } catch (error) {
      this._setError(error);
    }

    // No need to hang on to these any more.
    this._publicKeys = null;

    if (this._error) {
      process.nextTick(() => {
        invariant(this._error);
        this.emit(`metrics`, new Metrics.AuthFailure(this._error.message));
      });
    }

    this._unblock();
    callback(this._error);
  }

  async _verifyInternal(authData: string): Promise<void> {
    AuthenticateReadStream.log.debug(`_verifyInternal`, authData);

    invariant(this._publicKeys);
    invariant(!this._authenticated);

    const sharedSecret = this._sharedSecret;
    invariant(sharedSecret);

    // Try to verify the signature against all public keys known to us.
    const verifyResults = await Promise.all(
      this._publicKeys.map((publicKey) => {
        AuthenticateReadStream.log.debug(`Attempting to verify signature ` +
                                         `with '${publicKey}'`);
        const id = AccessToken.importPub(publicKey);
        return id.genVerify(sharedSecret, authData);
      })
    );

    if (verifyResults.some((result) => result)) {
      AuthenticateReadStream.log.info(`Receiving authenticated data`);
      this._authenticated = true;
      this.emit(`authenticated`);
      return;
    }

    AuthenticateReadStream.log.debug(`No known keys could authenticate the ` +
                                     `signature`);
    process.nextTick(() => this.emit(`unauthenticated`));

    AuthenticateReadStream.log.debug(`Waiting to see if unauthenticated data ` +
                                     `is allowed`);
    const allowUnauthenticated =
      await this._allowUnauthenticatedDeferred.promise;

    if (allowUnauthenticated) {
      AuthenticateReadStream.log.info(`Receiving unauthenticated data`);
      return;
    }

    throw new Error(`Unauthenticated data not allowed`);
  }

  _onSharedSecret(sharedSecret: Buffer): void {
    AuthenticateReadStream.log.debug(`_onSharedSecret ` +
                                     `<Buffer ${sharedSecret.length}>`);

    invariant(!this._sharedSecret);
    this._sharedSecret = sharedSecret.toString('hex');
  }

  get authenticated(): boolean {
    return this._authenticated;
  }
}

export class AuthenticateWriteStream extends AuthenticateStreamBase {

  static log = createLog(`streams:authenticate-read`);

  _accessToken: ?AccessToken;
  _sentSignatureDeferred: Deferred<void> = createDeferred();

  constructor(
    cryptoStream: CryptoDuplexStream,
    privateKey: string,
    options?: DuplexStreamOptions,
  ) {
    AuthenticateWriteStream.log.debug(`constructor`);

    invariant(privateKey);
    invariant(typeof privateKey === `string`);

    super(cryptoStream, options);

    this._accessToken = new AccessToken(``, privateKey);
  }

  _transform(
    data: Buffer | string,
    encoding: string,
    callback: ((error: ?Error, data?: Buffer | string) => void)
  ): void {
    invariant(!this._transformData);
    invariant(!this._transformCallback);

    // Previous failures effectively kill this stream.
    if (this._error) {
      callback(this._error);
      return;
    }

    if (typeof data !== 'object') {
      this._setError(new Error(`Data must be an object`));
      callback(this._error);
      return;
    }

    // Make sure auth messages don't come through the normal write pipe.
    if (isAuthData(data)) {
      this._setError(new Error(`Data cannot be auth data`));
      callback(this._error);
      return;
    }

    if (this._blocked) {
      AuthenticateWriteStream.log.debug(`Waiting to be unblocked`);
      this._transformData = data;
      this._transformCallback = callback;
      return;
    }

    callback(this._error, data);
  }

  _onSharedSecret(sharedSecret: Buffer): void {
    AuthenticateWriteStream.log.debug(`_onSharedSecret` +
                                      `<Buffer ${sharedSecret.length}>`);

    this._sendSignature(sharedSecret.toString('hex'));
  }

  async _sendSignature(sharedSecret: string): Promise<void> {
    AuthenticateWriteStream.log.debug(`_sendSignature`, sharedSecret);

    const accessToken = this._accessToken;
    this._accessToken = null;
    invariant(accessToken);

    try {
      const signature = await accessToken.genSign(sharedSecret);
      // $FlowFixMe: Flow doesn't understand streams in object mode.
      this.push({
        [PROPERTY_NAME]: signature,
      });
    } catch (error) {
      this._setError(error);
    }

    this._sentSignatureDeferred.accept();
  }

  async setAuthenticated(authenticated: boolean): Promise<void> {
    AuthenticateWriteStream.log.debug(`setAuthenticated`, authenticated);

    const [allowUnauthenticated] = await Promise.all([
      this._allowUnauthenticatedDeferred.promise,
      this._sentSignatureDeferred.promise,
    ]);

    if (authenticated || allowUnauthenticated) {
      this._unblock();
    } else {
      this._setError(new Error(`Unauthenticated data is not allowed`));
    }
  }

}

export class AuthenticateDuplexStream extends DuplexTransform {

  static log = createLog(`streams:authenticate-duplex`);

  __reader: AuthenticateReadStream;
  __writer: AuthenticateWriteStream;

  constructor(wrappedStream: Duplex,
              cryptoStream: CryptoDuplexStream,
              privateKey: string,
              publicKeys: Array<string>,
              options?: DuplexStreamOptions) {
    AuthenticateDuplexStream.log.debug(`constructor`);

    const reader =
      new AuthenticateReadStream(cryptoStream, publicKeys, options);
    const writer =
      new AuthenticateWriteStream(cryptoStream, privateKey, options);

    options = Object.assign({}, options);
    if (!(`objectMode` in options)) {
      options.objectMode = true;
    }
    if (!(`autoClose` in options)) {
      options.autoClose = true;
    }

    super(wrappedStream, wrappedStream, reader, writer, options);

    reader.once(`authenticated`, () => {
      AuthenticateDuplexStream.log.debug(`This stream is authenticated`);
      invariant(this.authenticated);
      writer.setAuthenticated(true);
      this.emit(`authenticated`);
    });

    reader.once(`unauthenticated`, () => {
      AuthenticateDuplexStream.log.debug(`This stream is unauthenticated`);
      invariant(!this.authenticated);
      writer.setAuthenticated(false);
      this.emit(`unauthenticated`);
    });

    this.__reader = reader;
    this.__writer = writer;
  }

  allowUnauthenticated(allow: boolean): void {
    AuthenticateDuplexStream.log.info(`allowUnauthenticated`, allow);

    this.__reader.allowUnauthenticated(allow);
    this.__writer.allowUnauthenticated(allow);
  }

  get authenticated(): boolean {
    return this.__reader.authenticated;
  }
}
