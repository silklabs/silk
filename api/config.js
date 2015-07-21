/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let serverUrl = process.env.SILK_SERVER_URL;

if (!serverUrl) {
  // TODO: how to set non-production in browser ...
  if ((process.env.NODE_ENV === 'production')
      || (typeof window === 'object')) {
    serverUrl = 'https://silk-test-server.herokuapp.com/';
  } else {
    serverUrl = 'http://localhost:5000/';
  }
}

module.exports = {
  server_url: serverUrl, //eslint-disable-line camelcase
};
