/*
 * raygun
 * https://github.com/MindscapeHQ/raygun4node
 *
 * Copyright (c) 2015 MindscapeHQ
 * Licensed under the MIT license.
 */

'use strict';

var http = require('http');
var https = require('https');

var send = function (options) {
  try {
    var data = new Buffer(JSON.stringify(options.message), 'utf8');
    var httpOptions = {
      host: options.host || 'api.raygun.io',
      port: options.port || 443,
      path: '/entries',
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
          'X-ApiKey': options.apiKey
      }
    };
    var cb = function (response) {
      if (options.callback) {
        options.callback(response);
      }
    };
    var httpLib = options.useSSL ? https : http;
    var request = httpLib.request(httpOptions, cb);

    request.on("error", function (e) {
      console.log("Raygun: error " + e.message + " occurred while attempting to send error with message: " + options.message);
    });
    
    request.write(data);
    request.end();
  } catch (e) {
    console.log("Raygun: error " + e + " occurred while attempting to send error with message: " + options.message);
  }
};

exports.send = send;
