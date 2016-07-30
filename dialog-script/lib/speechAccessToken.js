/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import createLog from 'silk-log/device';
import {uptime} from 'silk-sysutils';
import * as https from 'https';
import uuid from 'uuid';

export const CLIENT_ID = 'silk';
export const CLIENT_SECRET = 'c37612b45c964a0396bc577edcf61be3';
export const SPEECH_HOST = 'speech.platform.bing.com';
export const SPEECH_URL = 'https://' + SPEECH_HOST;
export const SPEECH_STT_PATH = '/recognize/query';
export const CRIS_HOST = 'd9833087eaca45feaa3d292c6ad98df9.api.cris.ai';
export const CRIS_STT_PATH = '/cris/speech/query';
export const CRIS_ID = '369385a6-353f-4f9c-9740-70e359a573c8';

// unique id for this app (can be anyyhing we choose)
export const APP_ID = 'D4D52672-91D7-4C74-8AD8-42B1D98141A5';
export const APP_ID_NO_DASH = APP_ID.replace(/-/g, '');

export const INSTANCE_ID = uuid.v4();
export const INSTANCE_ID_NO_DASH = INSTANCE_ID.replace(/-/g, '');

// specify STT service: true for CRIS, or false for normal Bing Speech
export const STT_USE_CRIS = false;

const log = createLog(`dialog-token`);
const RETRY_LIMIT = 3;

let accessTokenPromise: ?Promise<Object> = null;
let retryCounter = 0;
let requestStartUptime;

export function urlEncode(obj: Object): string {
  const list = [];
  Object.keys(obj).forEach(key => {
    list.push(`${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`);
  });
  return list.join(`&`);
}

function httpPost(opts: Object, data: string): Promise<Object> {
  return new Promise((resolve, reject) => {
    log.verbose(`Issuing access token request`);
    requestStartUptime = uptime();

    const req = https.request(opts, (res) => {
      let json = ``;
      res.on(`error`, (error) => reject(error));
      res.on(`data`, (chunk) => {
        json += chunk;
      });
      res.on(`end`, () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Access token request failed with status code ` +
                           `${res.statusCode}`));

          // Retry a few times to get access token
          if (retryCounter < RETRY_LIMIT) {
            log.verbose(`Renewing access token ${retryCounter + 1}/${RETRY_LIMIT}`);
            retryCounter++;
            process.nextTick(() => {
              accessTokenPromise = httpPost(opts, data);
            });
          } else {
            // Reset so that we try to get access token again when someone
            // needs it
            log.warn(`Giving up trying to renew access token`);
            accessTokenPromise = null;
          }
          return;
        }
        retryCounter = 0;
        const token = JSON.parse(json);
        const requestDuration = Math.floor(uptime(requestStartUptime));
        log.verbose(`Access token expires in ${token.expires_in} secs. ` +
                    `Request took ${requestDuration}ms`);

        // Renew access token a minute before expiring; just to be safe
        let renewTimer = (token.expires_in > 60) ? token.expires_in - 60 :
                         token.expires_in;
        renewTimer = renewTimer * 1000;

        // Renew access token
        setTimeout(() => {
          log.verbose(`Renewing access token`);
          accessTokenPromise = httpPost(opts, data);
        }, renewTimer);

        resolve(token.access_token);
      });
    });

    req.on(`error`, (error) => reject(error));
    req.write(data);
    req.end();
  });
}

export async function getAccessToken(): Promise<Object> {
  if (accessTokenPromise) {
    return accessTokenPromise;
  }

  const data = urlEncode({
    'grant_type': `client_credentials`,
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    scope: SPEECH_URL,
  });

  const opts = {
    hostname: `oxford-speech.cloudapp.net`,
    port: 443,
    path: `/token/issueToken`,
    method: `POST`,
    headers: {
      'Content-Type': `application/x-www-form-urlencoded`,
      'Content-Length': data.length,
    },
  };

  accessTokenPromise = httpPost(opts, data);
  return accessTokenPromise;
}
