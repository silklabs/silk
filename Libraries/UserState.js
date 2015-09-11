/**
 * This module contains helpers for maintaining the state of the user.
 *
 * This includes things like:
 *
 *  - current user
 *  - login state
 *  - accessToken
 */

import EventEmitter from 'EventEmitter';
import { AsyncStorage } from 'react-native';
import serialCalls from './dedupeCalls';
import { getRandomBytes } from './Crypto';

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
  api = null
  user = null
  _accessToken = null

  constructor(api) {
    super()
    // Initialized api client.
    this.api = api;

    serialCalls(this, 'getAccessToken');
  }

  async setAccessToken(id) {
    let json = JSON.stringify({
      publicKey: id.pub,
      privateKey: id.priv
    });
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, json);
  }

  /**
   * Get the public/private keys...
   */
  async getAccessToken() {
    // If we have already loaded it then just return it directly.
    if (this._accessToken) {
      return this._accessToken;
    }

    // Load from storage...
    let accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    if (!accessToken) {
      // See above comment for SHA256_HMAC_STRENGTH to understand what this is
      // doing.
      let entropy = await getRandomBytes(SHA256_HMAC_STRENGTH);
      let id = this.api.id.create({ entropy });
      await this.setAccessToken(id);
      return id;
    }

    let parsed = JSON.parse(accessToken);
    this._accessToken = new this.api.id(parsed.publicKey, parsed.privateKey);
    return this._accessToken;
  }

}
