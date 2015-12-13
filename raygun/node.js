/**
 *  raygun.io integration for Node (ES5)
 */
'use strict'

var raygun = require('raygun');
var config = require('./config.raygun.json');

var raygunClient;

module.exports = {
  enable: function enable(appName, appVersion, options) {
    console.log('Initializing Raygun');
    raygunClient = new raygun.Client();
    raygunClient.init({apiKey: config.apiKey});
    raygunClient.setVersion(appVersion);
    raygunClient.setTags(appName);

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
        const err = new Error('Unhandled Rejection at: Promise ' + p +
                              ' reason:' + reason);
        console.error('unhandledRejection', err, err.stack);
        throw err;
      });
    }
  },

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
};

