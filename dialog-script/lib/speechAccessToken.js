/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 * @private
 */

import createLog from 'silk-log';
import * as https from 'https';
import uuid from 'uuid';

export const CLIENT_ID = 'silk';
export const CLIENT_SECRET = '110e7213c3cc420ab03dea71fae35a53';
export const SPEECH_HOST = 'speech.platform.bing.com';
export const SPEECH_URL = 'https://' + SPEECH_HOST;

// unique id for this app (can be anyyhing we choose)
export const APP_ID = 'D4D52672-91D7-4C74-8AD8-42B1D98141A5';
export const APP_ID_NO_DASH = APP_ID.replace(/-/g, '');

export const INSTANCE_ID = uuid.v4();
export const INSTANCE_ID_NO_DASH = INSTANCE_ID.replace(/-/g, '');

const log = createLog(`dialog-token`);
const RETRY_LIMIT = 3;

let accessTokenPromise: ?Promise<Object> = null;
let retryCounter = 0;

export function urlEncode(obj: Object): string {
  const list = [];
  Object.keys(obj).forEach(key => {
    list.push(`${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`);
  });
  return list.join(`&`);
}

function httpPost(opts: Object, data: string): Promise<Object> {
  return new Promise((resolve, reject) => {
    log.info(`Issuing access token request`);

    const req = https.request(opts, (res) => {
      let json = ``;
      res.on(`error`, (error) => reject(error));
      res.on(`data`, (chunk) => json += chunk);
      res.on(`end`, () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Access token request failed with status code ` +
                           `${res.statusCode}`));

          // Retry a few times to get access token
          if (retryCounter < RETRY_LIMIT) {
            log.info(`Renewing access token ${retryCounter + 1}/${RETRY_LIMIT}`);
            retryCounter++;
            process.nextTick(() => accessTokenPromise = httpPost(opts, data));
          } else {
            // Reset so that we try to get access token again when someone
            // needs it
            accessTokenPromise = null;
          }
          return;
        }
        retryCounter = 0;
        let token = JSON.parse(json);
        log.debug(`Token expires in ${token.expires_in} secs`);

        // Renew access token a minute before expiring; just to be safe
        let renewTimer = (token.expires_in > 60) ? token.expires_in - 60 :
                         token.expires_in;
        renewTimer = renewTimer * 1000;

        // Renew access token
        setTimeout(() => {
          log.info(`Renewing access token`);
          accessTokenPromise = httpPost(opts, data);
        }, renewTimer);

        resolve(token.access_token);
      });
    });

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
