/**
 *  raygun.io integration for Node (ES5)
*
 * Copyright (c) 2015 Silk Labs, Inc
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

'use strict'

var raygun = require('raygun');
var api = require('./api.js');
var config = require('./config.raygun.json');
var https = require('https');
var MessageBuilder = require('raygun/lib/raygun.messageBuilder');

var raygunClient;

var tags;
var version;

module.exports = {
  enable: function enable(appName, appVersion, options) {
    console.log('Initializing Raygun');
    tags = [appName];
    version = appVersion;

    raygunClient = new raygun.Client();
    raygunClient.init({apiKey: config.apiKey});
    raygunClient.setVersion(version);
    raygunClient.setTags(tags);

    if (options && options.exceptionHandlers) {
      process.on('uncaughtException', function (err) {
        console.error('uncaughtException', err, err.stack);
        var exit = true;

        if (raygunClient) {
          try {
            console.log('Sending error report to Raygun');
            raygunClient.send(err, null, function () {
              console.log('Error report sent to Raygun, terminating process');
              process.exit(1);
            });
            exit = false;
          } catch (err) {
            console.error('uncaughtException', err, err.stack);
          }
        }
        if (exit) {
          process.exit(1);
        }
      });

      process.on('unhandledRejection', function (reason, p) {
        var err = new Error('Unhandled Rejection at: Promise ' + p +
                            ' reason:' + reason);
        console.error('unhandledRejection', err, err.stack);
        throw err;
      });
    }
  },

  // Sends an Error object to raygun
  send: function send(err, cb) {
    if (!cb) {
      cb = function () {};
    }
    if (raygunClient) {
      raygunClient.send(err, function () {
        console.log('Error report sent to Raygun');
        cb();
      });
    } else {
      cb();
    }
  },

  // Builds a new message from an Error object
  buildMessage: function(error, customData) {
    var builder = new MessageBuilder()
      .setMachineName()
      .setEnvironmentDetails()
      .setVersion(version)
      .setTags(tags);
    if (error) {
      builder.setErrorDetails(error);
    }
    if (customData) {
      builder.setUserCustomData(customData);
    }
    return builder.build();
  },

  // Posts a new message to raygun
  postMessage: function postMessage(message) {
    if (raygunClient) {
      return api.create(message);
    }
    return Promise.reject('Raygun client unconfigured');
  },
};

