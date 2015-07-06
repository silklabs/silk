/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// TODO: how to set non-production in browser ...
'use strict';

var usingProduction = process.env.NODE_ENV === 'production' || typeof window === 'object';

function chooseURL(environmentVariable, productionURL, engineeringURL) {
  var environmentValue = process.env[environmentVariable];
  if (environmentValue) {
    return environmentValue;
  }

  return usingProduction ? productionURL : engineeringURL;
}

module.exports = {
  server_url: chooseURL('SILK_SERVER_URL', 'http://silk-test-server.herokuapp.com/', 'http://localhost:5000/'),
  full_update_url: chooseURL('SILK_FULL_UPDATE_URL', 'https://silk-device.s3.amazonaws.com/master/latest/', 'http://localhost:5000/')
};
