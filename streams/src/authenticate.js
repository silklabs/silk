/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import {AccessToken} from 'silk-api';
import {createDeferred} from 'silk-async-utils';
import createLog from 'silk-log';

import ClosingTransform from './closing_transform';
import {CryptoDuplexStream} from './crypto';
import DuplexTransform from './duplex_transform';

import type {Duplex} from 'stream';
import type {Deferred} from 'silk-async-utils';
import type {DuplexStreamOptions} from 'silk-streams';

type TransformCallback = (error: ?Error, data?: Buffer | string) => void;

export type AuthenticateStatus =
  'unknown' |
  'unauthenticated' |
  'authenticated' |
  'paired';

const PROPERTY_NAME = `_0--"_`;

function isAuthData(data: Object): boolean {
  return data && (typeof data === `object`) && (PROPERTY_NAME in data);
}

export class AuthenticateStreamBase extends ClosingTransform {

  static log = createLog(`streams:authenticate-base`);

  _onSharedSecret: ((sharedSecret: Buffer) => void);

  _blocked: boolean = true;
  _allowCalled: boolean = false;
  _transformData: ?Object = null;
  _transformCallback: ?TransformCallback = null;

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

}

export class AuthenticateReadStream extends AuthenticateStreamBase {

  static log = createLog(`streams:authenticate-read`);

  _pairedPublicKeys: ?Array<string>;
  _unpairedPublicKeys: ?Array<string>;
  _sharedSecret: ?string = null;
  _receivedAuthData: boolean = false;
  _publicKey: ?string = null;
  _status: AuthenticateStatus = 'unknown';

  constructor(
    cryptoStream: CryptoDuplexStream,
    pairedPublicKeys: Array<string>,
    unpairedPublicKeys: Array<string>,
    options?: DuplexStreamOptions,
  ) {
    AuthenticateReadStream.log.debug(`constructor`);

    invariant(pairedPublicKeys);
    invariant(Array.isArray(pairedPublicKeys));
    pairedPublicKeys.forEach(
      (publicKey) => invariant(typeof publicKey === `string`)
    );

    invariant(Array.isArray(unpairedPublicKeys));
    unpairedPublicKeys.forEach(
      (publicKey) => invariant(typeof publicKey === `string`)
    );

    super(cryptoStream, options);

    this._pairedPublicKeys = pairedPublicKeys;
    this._unpairedPublicKeys = unpairedPublicKeys;
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
      if (!this._receivedAuthData) {
        this._setError(new Error(`Received data before auth data`));
        callback(this._error);
        return;
      }

      if (this._blocked) {
        AuthenticateReadStream.log.debug(`Waiting to be unblocked`);
        this._transformData = data;
        this._transformCallback = callback;
        return;
      }

      callback(this._error, data);
      return;
    }

    if (this._receivedAuthData) {
      this._setError(new Error(`Received multiple auth data`));
      callback(this._error);
      return;
    }

    this._receivedAuthData = true;

    invariant(this._publicKey === null);
    invariant(!this._paired);

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

    invariant(this._pairedPublicKeys);
    invariant(this._sharedSecret);
    invariant(this._publicKey === null);
    invariant(this._status === 'unknown');

    try {
      await this._verifyAuthData(authData);
    } catch (error) {
      this._setError(error);
    }

    // No need to hang on to these any more.
    this._pairedPublicKeys = null;
    this._unpairedPublicKeys = null;

    callback(this._error);
  }

  async _verifyAuthData(authData: string): Promise<void> {
    AuthenticateReadStream.log.debug(`_verifyAuthData`, authData);

    invariant(this._pairedPublicKeys);
    invariant(this._unpairedPublicKeys);
    invariant(this._publicKey === null);
    invariant(this._status === 'unknown');

    const sharedSecret = this._sharedSecret;
    invariant(sharedSecret);

    const pairedPublicKeyCount = this._pairedPublicKeys.length;

    // Try to verify the signature against all public keys known to us.
    const publicKeys = this._pairedPublicKeys.concat(this._unpairedPublicKeys);
    AuthenticateReadStream.log.debug(`Attempting to verify signature`,
                                     publicKeys);
    let verifyResults = await Promise.all(
      publicKeys.map((publicKey) => {
        const id = AccessToken.importPub(publicKey);
        return id.genVerify(sharedSecret, authData);
      })
    );

    let status = this._status;

    for (let index = 0; index < verifyResults.length; index++) {
      if (verifyResults[index]) {
        const publicKey = this._publicKey = publicKeys[index];
        const paired = index < pairedPublicKeyCount;

        const pairedMessage = paired ? `paired and ` : ``;
        AuthenticateReadStream.log.info(
          `Receiving ${pairedMessage}authenticated data from`,
          publicKey,
        );

        status = paired ? 'paired' : 'authenticated';
        break;
      }
    }

    if (status === 'unknown') {
      AuthenticateReadStream.log.debug(
        `Receiving unauthenticated data from unknown source`
      );
      status = 'unauthenticated';
    }

    invariant(status !== 'unknown');
    this._status = status;

    process.nextTick(() => {
      this.emit(`status`, status);
      this.emit(status);
    });
  }

  _onSharedSecret(sharedSecret: Buffer): void {
    AuthenticateReadStream.log.debug(`_onSharedSecret ` +
                                     `<Buffer ${sharedSecret.length}>`);

    invariant(!this._sharedSecret);
    this._sharedSecret = sharedSecret.toString('hex');
  }

  allow(allowed: boolean): void {
    AuthenticateReadStream.log.debug(`allow`, allowed);

    invariant(!this._allowCalled);
    this._allowCalled = true;

    process.nextTick(() => {
      if (allowed) {
        this._unblock();
      } else {
        this._setError(new Error(`Not allowed`));
      }
    });
  }

  setPaired(publicKey: string): void {
    AuthenticateReadStream.log.debug(`setPaired`, publicKey);

    invariant(this._status === 'unauthenticated' ||
              this._status === 'authenticated');
    if (this._status === 'authenticated') {
      invariant(this._publicKey === publicKey);
    }

    const status = this._status = 'paired';
    this._publicKey = publicKey;

    process.nextTick(() => {
      this.emit(`status`, status);
      this.emit(status);
    });
  }

  get publicKey(): ?string {
    return this._publicKey;
  }

  get status(): AuthenticateStatus {
    return this._status;
  }

}

export class AuthenticateWriteStream extends AuthenticateStreamBase {

  static log = createLog(`streams:authenticate-write`);

  _accessToken: AccessToken;
  _sentSignatureDeferred: Deferred<void> = createDeferred();

  constructor(
    cryptoStream: CryptoDuplexStream,
    accessToken: AccessToken,
    options?: DuplexStreamOptions,
  ) {
    AuthenticateWriteStream.log.debug(`constructor`);

    invariant(accessToken);

    super(cryptoStream, options);

    this._accessToken = accessToken;
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

    try {
      const signature = await this._accessToken.genSign(sharedSecret);
      // $FlowFixMe: Flow doesn't understand streams in object mode.
      this.push({
        [PROPERTY_NAME]: signature,
      });
    } catch (error) {
      this._setError(error);
    }

    this._sentSignatureDeferred.accept();
  }

  allow(allowed: boolean): void {
    AuthenticateWriteStream.log.debug(`allow`, allowed);

    invariant(!this._allowCalled);
    this._allowCalled = true;

    process.nextTick(async () => {
      await this._sentSignatureDeferred.promise;

      if (allowed) {
        this._unblock();
      } else {
        this._setError(new Error(`Not allowed`));
      }
    });
  }

}

export class AuthenticateDuplexStream extends DuplexTransform {

  static log = createLog(`streams:authenticate-duplex`);

  __reader: AuthenticateReadStream;
  __writer: AuthenticateWriteStream;

  constructor(wrappedStream: Duplex,
              cryptoStream: CryptoDuplexStream,
              accessToken: AccessToken,
              pairedPublicKeys: Array<string>,
              unpairedPublicKeys: Array<string>,
              options?: DuplexStreamOptions) {
    AuthenticateDuplexStream.log.debug(`constructor`);

    const reader = new AuthenticateReadStream(
      cryptoStream,
      pairedPublicKeys,
      unpairedPublicKeys,
      options,
    );
    const writer = new AuthenticateWriteStream(
      cryptoStream,
      accessToken,
      options,
    );

    options = Object.assign({}, options);
    if (!(`objectMode` in options)) {
      options.objectMode = true;
    }
    if (!(`autoClose` in options)) {
      options.autoClose = true;
    }

    super(wrappedStream, wrappedStream, reader, writer, options);

    reader.addListener(`status`, (status) => this.emit(`status`, status));
    reader.once(`unauthenticated`, (status) => this.emit(`unauthenticated`));
    reader.once(`authenticated`, (status) => this.emit(`authenticated`));
    reader.once(`paired`, (status) => this.emit(`paired`));

    this.__reader = reader;
    this.__writer = writer;
  }

  allow(allowed: boolean): void {
    AuthenticateDuplexStream.log.info(`allow`, allowed);

    this.__reader.allow(allowed);
    this.__writer.allow(allowed);
  }

  setPaired(publicKey: string): void {
    AuthenticateDuplexStream.log.info(`setPaired`, publicKey);

    this.__reader.setPaired(publicKey);
  }

  get publicKey(): ?string {
    return this.__reader.publicKey;
  }

  get status(): AuthenticateStatus {
    return this.__reader.status;
  }

}
