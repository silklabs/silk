/**
 * Basic http client which provides shared functionality (including JWT) for all
 * our api calls
 *
 * @flow
 */
import assert from 'assert';
import fetch from './fetch';
import URL from 'url';
import throwError from './fetch_error';
import debug from 'debug';
import {bodySignature} from './jwt_request_signature';

import type AccessToken from './access_token';

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

function getRequestID(): string {
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



function sleep(duration) {
  return new Promise((accept) => {
    setTimeout(accept, duration);
  });
}

export type StateContainerOptions = {
  serverUrl: string;
  accessToken: ?AccessToken;
}

/**
 * We need the ability to "hot reload" the configuration of accessToken and the
 * serverUrl at will from webapp/app. Using a specific container type allows us
 * to do this by mutating the container (which can be shared) rather then every
 * api instance.
 */
export class StateContainer {
  serverUrl: string;
  accessToken: ?AccessToken;

  constructor(options: StateContainerOptions) {
    this.update(options);
  }

  update(options: StateContainerOptions) {
    assert(options.serverUrl);
    this.serverUrl = options.serverUrl;
    this.accessToken = options.accessToken;
  }
}

export default class HttpClient {
  name: string;
  maxiumRetryDelayMs: number = MAXIMUM_RETRY_DELAY_MS;
  maxRetries: number = MAXIMUM_RETRIES;
  retryDelayMinMs: number = RETRY_DELAY_MIN_MS;
  retryDelayMaxMs: number = RETRY_DELAY_MAX_MS;
  requestTimeout: number = REQUEST_TIMEOUT_MS;

  _state: StateContainer;

  constructor(state: StateContainer, options: {[key: string]: any} = {}) {
    this._state = state;
    Object.assign(this, options);
  }

  _logger: ?(...args: any) => void;
  _log(...args: any): void {
    if (!this._logger) {
      this._logger = debug(`silk-api:${this.name}`);
    }
    if (this._logger) { // XXX: Make flow happy by adding another if...
      this._logger(...args);
    }
  }

  async _sleep(interval: number, retry: number, id: string): Promise<void> {
    let duration = Math.min(Math.pow(2, retry) * interval, this.maxiumRetryDelayMs);
    this._log(`Wait (${id}) for ${duration}`);
    await sleep(duration);
  }

  // XXX: This is a hack since we still do not support true GET requests...
  request(method: string, url: string): Promise<any> {
    return this.requestWithBody(method, url, {});
  }

  async requestWithBody(method: string, url: string, body: {[key: string]: any}): Promise<any> {
    // XXX: This "request id" is for display only right now at some point in the
    // future we should send more meaningful (uuid) ids that are logged across
    // the various services we hit so we can track where they originated and why.
    const id = getRequestID();
    const timeoutHandler = () => {
      throw new Error(`Response Timeout (${id}) failed to respond in ${this.requestTimeout}`);
    };
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
        let timeout = sleep(this.requestTimeout).then(timeoutHandler);
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
  async _sendRequestWithBody(
    method: string,
    url: string,
    body: any,
    id: string
  ): Promise<any> {
    let accessToken = this._state.accessToken;
    if (!accessToken) {
      throw new Error('accessToken is required...');
    }

    body = JSON.stringify(body);
    let signature = bodySignature(accessToken, method, url, body);
    let headers = {
      'authorization': `Bearer ${signature}`,
      'content-type': 'application/json'
      // NOTE: content-length is intentionally omitted the underlying http layer
      // can provide it if it desires so we don't need to worry about cross
      // platform byte length issues.
    };

    let absURL = URL.resolve(this._state.serverUrl, url);
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
