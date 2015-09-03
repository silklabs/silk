/**
 * Basic http client which provides shared functionality (including JWT) for all
 * our api calls
 */

import fetch from './fetch';
import URL from 'url';
import throwError from './fetch_error';
import jwa from './jwa';
import jwt from 'jsonwebtoken';
import { sha } from 'hash.js';

export default class HttpClient {
  constructor(baseUrl) {
    if (!baseUrl) {
      throw new Error('baseUrl is required');
    }
    this.baseUrl = baseUrl;
  }

  set key(value) {
    if (!value.pub) {
      throw new Error('Invalid key (missing .pub)');
    }
    if (!value.priv) {
      throw new Error('Invalid key (missing .priv)');
    }
    this._key = value;
  }

  get key() {
    if (!this._key) {
      throw new Error('client.key is missing please set it.');
    }
    return this._key;
  }

  /**
   * Issue a JWT signed request to the server.
   *
   * TODO:
   *  - cross platform timeouts
   *  - retires
   */
  async requestWithBody(method, url, body) {
    body = JSON.stringify(body);
    let jwtPayload = {
      // sha1 of the json body...
      sha256: sha.sha256().update(body).digest('hex')
    };

    // TODO: Add hash of body to payload...
    let signature = jwt.sign(jwtPayload, this.key.priv, {
      /**
       * Remember headers are _not_ signed do not trust them and do not put
       * values in here that are implicitly assumed to be verified.
       */
      headers: {
        /**
         * The server will identify us based on the public key we send it is
         * sent in the clear here as an "id" the server _must_ validate this
         * against known public keys.
         *
         * XXX: An alternative design would be to use an opaque id which is
         * assigned to us by the server but that was deemed to add complexity
         * without much value.
         */
        id: this.key.pub
      },
      algorithm: 'ed25519',
      jwa: jwa
    });

    let headers = {
      'authorization': `Bearer ${signature}`,
      'content-type': 'application/json'
      // NOTE: content-length is intentionally omitted the underlying http layer
      // can provide it if it desires so we don't need to worry about cross
      // platform byte length issues.
    };

    let res = await fetch(URL.resolve(this.baseUrl, url), {
      method,
      body: body,
      headers: headers
    });

    if (!res.ok) {
      await throwError(res);
    }

    return await res.json();
  }
}
