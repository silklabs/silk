/**
 * Node-like veneer for https://raygun.io/raygun-providers/rest-json-api
 *
 * Copyright (c) 2015-2016 Silk Labs, Inc
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

'use strict';

const config = require('./config');
const https = require('https');

module.exports = {

  /**
   * POST a new crash.
   *
   * message: object confirming to the raygun REST API
   *
   * Returns a Promise
   */
  create: function create(message) {
    if (!config.apiKey) {
      return Promise.resolve();
    }
    return new Promise(function(resolve, reject) {
      const data = new Buffer(JSON.stringify(message), 'utf8');
      const httpOptions = {
        host: 'api.raygun.io',
        port: 443,
        path: '/entries',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
          'X-ApiKey': config.apiKey,
        }
      };

      const request = https.request(
        httpOptions,
        function (response) {
          console.log('Raygun response:', response.statusCode, response.statusMessage);
          if (response.statusCode === 202) {
            resolve();
          } else {
            reject('Raygun post failed: ' + response.statusCode);
          }
        }
      );
      request.on('error', function (err) {
        console.log('Raygun error', err.message, 'while attempting to post message');
        reject(err);
      });
      request.write(data.toString());
      request.end();
    });
  },
};
