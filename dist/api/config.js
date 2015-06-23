/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var server_url = process.env.SILK_SERVER_URL;

if (!server_url) {
  // TODO: how to set non-production in browser ...
  if (process.env.NODE_ENV === 'production' || typeof window === 'object') {
    server_url = 'http://192.168.2.1:5000/';
  } else {
    server_url = 'http://192.168.2.1:5000/';
  }
}

module.exports = {
  server_url: server_url
};
