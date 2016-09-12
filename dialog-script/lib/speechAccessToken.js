/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import invariant from 'assert';
import * as https from 'https';
import createLog from 'silk-log/device';
import {
  timeout,
  uptime,
} from 'silk-sysutils';
import uuid from 'uuid';

type AccessToken = {
  access_token: string;
  expires_in: number;
};

export const CLIENT_ID = 'silk';
export const CLIENT_SECRET = 'c37612b45c964a0396bc577edcf61be3';
export const SPEECH_HOST = 'speech.platform.bing.com';
export const SPEECH_URL = 'https://' + SPEECH_HOST;
export const SPEECH_STT_PATH = '/recognize/query';
export const CRIS_HOST = 'd9833087eaca45feaa3d292c6ad98df9.api.cris.ai';
export const CRIS_STT_PATH = '/cris/speech/query';
export const CRIS_ID = '369385a6-353f-4f9c-9740-70e359a573c8';

// unique id for this app (can be anything we choose)
export const APP_ID = 'D4D52672-91D7-4C74-8AD8-42B1D98141A5';
export const APP_ID_NO_DASH = APP_ID.replace(/-/g, '');

export const INSTANCE_ID = uuid.v4();
export const INSTANCE_ID_NO_DASH = INSTANCE_ID.replace(/-/g, '');

// specify STT service: true for CRIS, or false for normal Bing Speech
export const STT_USE_CRIS = false;

const RETRY_LIMIT = 3;
const RETRY_DELAY_SEC = 1;
const TIMEOUT_SEC = 30;
const RENEW_WINDOW_SEC = 60;

const log = createLog(`dialog-token`);

export function urlEncode(obj: Object): string {
  const list = [];
  Object.keys(obj).forEach(key => {
    list.push(`${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`);
  });
  return list.join(`&`);
}

function fetchToken(): Promise<AccessToken> {
  const data = urlEncode({
    'grant_type': `client_credentials`,
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    scope: SPEECH_URL,
  });

  const requestArgs = {
    hostname: `oxford-speech.cloudapp.net`,
    port: 443,
    path: `/token/issueToken`,
    method: `POST`,
    headers: {
      'Content-Type': `application/x-www-form-urlencoded`,
      'Content-Length': data.length,
    },
  };

  log.info(`Issuing access token request`);
  const requestStartUptime = uptime();

  return new Promise((resolve, reject) => {
    const req = https.request(requestArgs, (res) => {
      res.once(`error`, (error) => {
        log.warn(`Access token response error`, error);
        reject(error);
      });

      let json = ``;
      res.on(`data`, (chunk) => {
        json += chunk;
      });
      res.once(`end`, () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Access token request failed with status code ` +
                           `${res.statusCode}`));
          return;
        }

        const requestDuration = Math.floor(uptime(requestStartUptime));
        log.debug(`Access token request took ${requestDuration}ms`);

        const accessToken = JSON.parse(json);
        resolve(accessToken);

        log.info(`Access token request succeeded`);
      });
    });

    req.once(`error`, (error) => {
      log.warn(`Access token request error`, error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function fetchTokenWithRetry(timeoutError: Error): Promise<AccessToken> {
  let finalError: Error;

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    try {
      const accessToken = await Promise.race([
        fetchToken(),
        timeout(TIMEOUT_SEC * 1000).then(() => {
          throw timeoutError;
        }),
      ]);
      return accessToken;
    } catch (error) {
      log.warn(`Failed to fetch access token (attempt ${(attempt + 1)})`,
               error);
      finalError = error;

      if (RETRY_DELAY_SEC && attempt < RETRY_LIMIT) {
        await timeout(RETRY_DELAY_SEC * 1000);
      }
    }
  }

  invariant(finalError);
  throw finalError;
}

let accessTokenPromise: ?Promise<string> = null;

export function getAccessToken(): Promise<string> {
  if (accessTokenPromise) {
    log.debug(`Already have or fetching the access token`);
    return accessTokenPromise;
  }

  // Create error here so we get a good stack trace.
  const timeoutError = new Error(`Timed out fetching access token`);

  accessTokenPromise = fetchTokenWithRetry(timeoutError)
    .then((accessToken: AccessToken) => {
      log.debug(`Got access token`, accessToken);

      const renewDelaySec = (accessToken.expires_in > RENEW_WINDOW_SEC) ?
                            accessToken.expires_in - RENEW_WINDOW_SEC :
                            accessToken.expires_in;
      setTimeout(() => {
        accessTokenPromise = null;
        getAccessToken();
      }, renewDelaySec * 1000);

      return accessToken.access_token;
    }).catch((error) => {
      accessTokenPromise = null;
      throw error;
    });

  return accessTokenPromise;
}
