/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import eventToPromise from 'event-to-promise';

export default async function main (config) {
  let http = require('http').createServer();
  let io = require('socket.io')(http, {
    // XXX: Only accept websocket clients for now to work around app issues.
    transports: ['websocket']
  });

  // Install the socket.io listeners.
  require('./routes')(io);

  http.listen(config.socketio.port);
  let errorEvent = eventToPromise(http, 'error').then(err => {
    throw err;
  });

  let connected = eventToPromise(http, 'listening').then(() => {
    // XXX: This is sorta a hack and only intended for development/testing...
    if (!config.socketio.publicUrl) {
      config.socketio.publicUrl = `http://localhost:${http.address().port}`;
    }
  });

  // await to be connected correctly...
  await Promise.race([errorEvent, connected]);

  // This interface is only ever supposed to be used from tests.
  return {
    // Useful because tests bind on 0 we don't know which port we are using
    // until this is done.
    port: http.address().port,

    // Do any cleanup here that would normally happen because of the server
    // process being killed. We do this instead of closing the process mostly
    // for performance.
    close: async() => {
      http.close();
    }
  };
}

