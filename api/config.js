/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let server_url = process.env.SILK_SERVER_URL;

if (!server_url) {
  // TODO: how to set non-production in browser ...
  if ((process.env.NODE_ENV === 'production')
      || (typeof window === 'object')) {
    server_url = 'http://silk-test-server.herokuapp.com/';
  } else {
    server_url = 'http://localhost:5000/';
  }
}

module.exports = {
  server_url: server_url,
};
