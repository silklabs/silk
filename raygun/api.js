/**
 * Node-like veneer for https://raygun.io/raygun-providers/rest-json-api
 *
 * Copyright (c) 2015 Silk Labs, Inc
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

'use strict'

var config = require('./config.raygun.json');
var https = require('https');

module.exports = {

  // POST a new crash.
  //
  // message: object confirming to the raygun REST API
  //
  // Returns a Promise
  create: function create(message) {
    return new Promise(function(resolve, reject) {
      var data = new Buffer(JSON.stringify(message), 'utf8');
      var httpOptions = {
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

      var request = https.request(httpOptions,
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
