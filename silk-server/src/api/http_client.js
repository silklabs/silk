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
import uuid from 'uuid';
import debug from 'debug';

const MAX_ID = 999;
const ID_LENGTH = String(MAX_ID).length;

const MAXIMUM_RETRY_DELAY_MS = 30 * 1000;
const MAXIMUM_RETRIES = 10;

// Jitter time is a guess...
const RETRY_DELAY_MIN_MS = 10;
const RETRY_DELAY_MAX_MS = 50;

/**
 * How long to wait for each request to return an initial response (headers).
 */
const REQUEST_TIMEOUT_MS = 30 * 1000;

// We cycle through request ID's 0-999 to make this more readable.
let requestID = 0;

function getRequestID() {
  let id = requestID++;
  if (id > MAX_ID) {
    requestID = 0;
  }

  // Format to include leading zeros...
  let strID = String(id);
  while (strID.length < ID_LENGTH) {
    strID = `0${strID}`;
  }
  return strID;
}

function sha256(str) {
  return sha.sha256().update(str).digest('hex');
}

function sleep(duration) {
  return new Promise((accept) => {
    setTimeout(accept, duration);
  });
}

export default class HttpClient {
  maxiumRetryDelayMs = MAXIMUM_RETRY_DELAY_MS;
  maxRetries = MAXIMUM_RETRIES;
  retryDelayMinMs = RETRY_DELAY_MIN_MS;
  retryDelayMaxMs = RETRY_DELAY_MAX_MS;
  requestTimeout = REQUEST_TIMEOUT_MS;

  constructor(baseURL, options = {}) {
    if (!baseURL) {
      throw new Error('baseURL is required');
    }
    this.baseURL = baseURL;
    Object.assign(this, options);
  }

  _logger = null;
  _log(...args) {
    if (!this._logger) {
      this._logger = debug(`silk-api:${this.name}`);
    }
    this._logger(...args);
  }

  get key() {
    return this.accessToken;
  }

  set key(value) {
    return this.accessToken = value;
  }

  set accessToken(value) {
    this._log('set access token', value && value.pub);
    this._accessToken = value;
  }

  get accessToken() {
    // Allow the key to be undefined or null but throw an error if we attempt to
    // use it in that state.
    if (!this._accessToken || !this._accessToken.priv) {
      throw new Error('client.key is missing please set it.');
    }
    return this._accessToken;
  }

  async _sleep(interval, retry, id) {
    let duration = Math.min(Math.pow(2, retry) * interval, this.maxiumRetryDelayMs);
    this._log(`Wait (${id}) for ${duration}`);
    await sleep(duration);
  }

  async requestWithBody(method, url, body) {
    // XXX: This "request id" is for display only right now at some point in the
    // future we should send more meaningful (uuid) ids that are logged across
    // the various services we hit so we can track where they originated and why.
    const id = getRequestID();
    let retry = 0;
    let lastErr;

    // Base amount of time to use in retry delays...
    let retryDelay;

    /**
     * NOTE: We cannot abort or cancel an ongoing fetch request. This might
     * cause leaks or other problems if the underlying implementation is not
     * cleaning things up. Someday we might need to rework this into lower level
     * implementation with optimizations for node.
     */
    do {
      try {
        let attempt = this._sendRequestWithBody(method, url, body, id, retry);
        let timeout = sleep(this.requestTimeout).then(() => {
          throw new Error(`Response Timeout (${id}) failed to respond in ${this.requestTimeout}`);
        });
        return await Promise.race([attempt, timeout]);
      } catch (err) {
        // If we have a status code outside of the server error range simply
        // throw the error...
        if (err.status && (err.status < 500)) {
          this._log(`Error (${id}) in http request`, err);
          throw err;
        }

        lastErr = err;

        // Otherwise retry if we have any left over attempts...
        if (retry < this.maxRetries) {
          this._log(
            `Retry (${retry}/${this.maxRetries}) on error (${id}) ${method} ${url}`,
            err
          );

          if (!retryDelay) {
            retryDelay = Math.floor(
              Math.random() * (this.retryDelayMinMs - this.retryDelayMaxMs + 1)
            ) + this.retryDelayMaxMs;
          }

          await this._sleep(retryDelay, retry, id);
        }
      }
    } while(retry++ < this.maxRetries);

    this._log(`Exhausted retries (${id}) ${method} ${url}`);
    throw lastErr;
  }

  /**
   * Underlying implementation which actually builds the request.
   */
  async _sendRequestWithBody(method, url, body, id) {
    body = JSON.stringify(body);
    let canonicalReq = `${url}\n${method.toLowerCase()}\n${sha256(body)}`;
    let jwtPayload = {
      // Unique id for this request.
      jti: uuid.v1(),
      // JSON representation of a string...
      iat: new Date().toJSON(),
      // sha1 of the json body...
      requestHash: sha256(canonicalReq)
    };

    // TODO: Add hash of body to payload...
    let signature = jwt.sign(jwtPayload, this.key.priv, {
      /**
       * Remember headers are _not_ signed do not trust them and do not put
       * values in here that are implicitly assumed to be verified.
       */
      headers: {
        /**
         * The server will identify us based on the public key. We send it is
         * sent in the clear here as an "id" then server _must_ validate this
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

    let absURL = URL.resolve(this.baseURL, url);
    this._log(`Request (${id}) ${method} ${absURL}`);

    let start = Date.now();
    let res = await fetch(absURL, {
      method,
      body: body,
      headers: headers
    });

    let headDetails = '';
    headDetails += `status=${res.status} `;
    headDetails += `length=${res.headers.get('content-length')} `;
    headDetails += `duration=${Date.now() - start}ms`;
    this._log(`Headers (${id}) ${method} ${absURL} [${headDetails}]`);

    if (!res.ok) {
      await throwError(res);
    }

    let resBody = await res.json();
    this._log(`Body (${id}) ${method} ${absURL}`);
    return resBody;
  }
}
