/**
 * This module contains helpers for maintaining the state of the user.
 *
 * This includes things like:
 *
 *  - current user
 *  - login state
 *  - accessToken
 */

// The API violates this rule, so disable it for the whole file.
/* eslint new-cap:0 */

import EventEmitter from 'EventEmitter';
import { AsyncStorage } from 'react-native';
import { getRandomBytes, PBKDF2KeyDerivation } from './Crypto';
import createDebug from 'debug';

const log = createDebug('UserState');
const ACCESS_TOKEN_KEY = 'user.accessToken';

/**
 * This value has been chosen based on what elliptic would do when generating
 * it's own entropy.
 *
 * See: https://github.com/indutny/elliptic/blob/cbccbc862bcbb3a0f2ce8021d340e51f785e2ebd/lib/elliptic/ec/index.js#L60
 * See: https://github.com/indutny/hash.js/blob/b8d200196b7e8a335d1f94c6b14366491822b7bb/lib/hash/sha.js#L105
 *
 * The ed25519 algorithm uses sha256 under the hood.
 */
const SHA256_HMAC_STRENGTH = 192;

export default class UserState extends EventEmitter {

  /**
   * API Client
   */
  api = null;
  _accessToken = null;

  constructor(api) {
    super();
    // Initialized api client.
    this.api = api;
  }

  async setAccessToken(accessToken) {
    log('Set access token', accessToken);
    let json = JSON.stringify({
      publicKey: accessToken.pub,
      privateKey: accessToken.priv,
    });
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, json);
  }

  async createAccessToken() {
    // See above comment for SHA256_HMAC_STRENGTH to understand what this is
    // doing.
    let entropy = await getRandomBytes(SHA256_HMAC_STRENGTH);
    let accessToken = this.api.id.create({ entropy });
    return accessToken;
  }

  /**
   * Get the public/private keys...
   */
  async getAccessToken() {
    // If we have already loaded it then just return it directly.
    if (this._accessToken) {
      return this._accessToken;
    }

    let accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    if (!accessToken) {
      log('No access token set....');
      return accessToken;
    }

    let parsed = JSON.parse(accessToken);
    this._accessToken = new this.api.id(parsed.publicKey, parsed.privateKey);
    log('Using existing access token', this._accessToken);
    return this._accessToken;
  }

  async signOut() {
    // Clear out any previous state...
    this._accessToken = null;
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
  }

  async checkPassword(email, password) {
    let vip = this.api.vip;
    let passwordHash = await PBKDF2KeyDerivation(
      password, /* input */
      email /* salt */
    );

    return await vip.checkPassword({
      email,
      passwordHash,
    });
  }

   /**
   * Attempt to sign into the server... Note: this looks pretty similar to sign
   * up right now this will diverge over time.
   */
  async attemptSignIn(email, password) {
    log('Attempting user sign in');
    // Always create a new token when we attempt a sign up...
    let vip = this.api.vip;
    let accessToken = await this.createAccessToken();
    vip.key = accessToken;

    let passwordHash = await PBKDF2KeyDerivation(
      password, /* input */
      email /* salt */
    );

    // XXX: Put some more useful information here...
    let userAgent = 'iOS';

    let result = await vip.signIn({
      email,
      passwordHash,
      userAgent,
    });

    if (result.success) {
      log('Successfully signed into account', email);
      await this.setAccessToken(accessToken);
      return true;
    }
    return false;
  }

  /**
   * Attempt a user signup with the server.
   */
  async attemptSignup(email, password) {
    log('Attempting user sign up');
    // Always create a new token when we attempt a sign up...
    let vip = this.api.vip;
    let accessToken = await this.createAccessToken();
    vip.key = accessToken;

    let passwordHash = await PBKDF2KeyDerivation(
      password, /* input */
      email /* salt */
    );

    // XXX: Put some more useful information here...
    let userAgent = 'iOS';

    let result = await vip.createAccount({
      email,
      passwordHash,
      userAgent,
    });

    if (result.success) {
      log('Successfully created account');
      await this.setAccessToken(accessToken);
      return true;
    }
    return false;
  }

   /**
   * Attempt logging in with the developer credentials...
   */
  async attemptDeveloperLogin() {
    log('Logging in via developer account');
    let account = this.api.devAccount;
    let vip = this.api.vip;
    let accessToken = new this.api.id(account.publicKey, account.privateKey);

    // Use given developer account access token.
    vip.key = accessToken;

    let check = await this.checkPassword(account.email, account.password);
    if (check.success) {
      log('Successfully logged in as', account.email);
      await this.setAccessToken(accessToken);
      return true;
    }
    // Reset to current access token...
    vip.key = await this.getAccessToken();
    log('Failed to logged in as', account.email);
    return false;
  }

}
