/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

/**
 * Helper for testing stream based retries. Will simulate various network
 * conditions shallowly.
 */

import http from 'http';
import net from 'net';
import eventToPromise from 'event-to-promise';
import assert from 'assert';
import createDebug from 'debug';

import StoringStream from '../lib/streams/store';
import { EventEmitter } from 'events';

const debug = createDebug('stream-server');

// get an open port...
async function getPort() {
  let server = net.createServer(() => {});
  server.listen(0);
  await eventToPromise(server, 'listening');
  let { port } = server.address();
  server.close();
  await eventToPromise(server, 'close');
  return port;
}

class StreamHandle extends EventEmitter {
  // Set to true when server gets full request and responds with 200.
  success = false

  // Content buffer (only set when success = true)
  content = null

  // Each attempt to finish the request.
  attempts = [];

  // When true will destroy the client side of the socket upon receiving this
  // request...
  forceAbort = false

  // Amount of time to delay before responding to request.
  delay = 0

  url = null;

  constructor(url) {
    super();
    this.url = url;
  }
}

class StreamServer {
  constructor(port) {
    this.port = port;
    this.sockets = [];
    this.streams = new Map();
  }

  registerStream(id) {
    assert(typeof id === 'number');
    let handle = new StreamHandle(`http://localhost:${this.port}/${id}`);
    this.streams.set(id, handle);
    debug('register', id);
    return handle;
  }

  handleRequest(req, res) {
    let id = parseInt(req.url.slice(1), 10);
    let stream = this.streams.get(id);
    debug('handle request', req.url);

    if (!stream) {
      res.writeHead(500);
      res.end();
      return;
    }

    let storing = new StoringStream();
    req.pipe(storing);

    stream.attempts.push({ req, stream: storing });
    stream.emit('request');

    if (stream.forceAbort) {
      debug('force abort', req.url);
      req.socket.destroy();
      return;
    }

    storing.on('error', (err) => {
      console.log('Unexpected error', err);
      res.writeHead(500);
      res.end();
    });

    storing.on('finish', async () => {
      debug('client finished writing...');
      stream.success = true;

      // Make it easy to inspect the result...
      let content = new Buffer(0);
      storing.on('data', (buffer) => {
        content = Buffer.concat([content, buffer]);
      });
      await eventToPromise(storing, 'end');

      setTimeout(() => {
        // Save the state so we can inspect it in later tests...
        stream.content = content;
        stream.success = true;
        debug('successfully finished', req.url);
        res.writeHead(200);
        res.end();
      }, stream.delay);
    });
  }

  async listen() {
    this.server = http.createServer((...args) => {
      this.handleRequest(...args);
    });

    this.server.on('connection', (socket) => {
      this.sockets.push(socket);
    });

    this.server.listen(this.port);
    await eventToPromise(this.server, 'listening');
  }

  async close() {
    for (let socket of this.sockets) {
      // Server forcibly is closing the sockets...
      socket.destroy();
    }
    this.server.close();
    await eventToPromise(this.server, 'close');
  }
}

export default async function () {
  let port = await getPort();
  return new StreamServer(port);
}
