/**
 * This is a helper to mimic MITM attacks and other types of attacks where at
 * some point the attack can see traffic (if not manipulate it).
 *
 * As a general note some of these attacks may be unrealistic in the presence of
 * properly implemented https.
 */

import express from 'express';
import fetch from 'node-fetch';
import launchApp from './launch_app';
import { EventEmitter } from 'events';
import URL from 'url';

class Request {
  constructor(method, path, headers, body) {
    Object.assign(this, { method, path, body, headers });
  }

  /**
   * Send a request... Note this object may be mutated to change the request.
   */
  async send(baseUrl) {
    let url = URL.resolve(baseUrl, this.path);
    let parsed = URL.parse(url);

    let headers = Object.assign(
      {},
      this.headers,
      {
        host: parsed.host
      }
    );

    let res = await fetch(url, {
      method: this.method,
      headers,
      body: this.body
    });
    let body = await res.text();
    return { res, body };
  }

  /**
   * Reply to the client which made the request...
   */
  async reply() {
  }
}

class Intercept extends EventEmitter {

  requests = []

  constructor(app) {
    super();
    this.app = app;
    this.observe(app);
  }

  observe() {
    /**
     * Note: if the client is outright intercepted (as done below) there
     * is no real security measure we can implement aside from how we sign
     * the requests. The below is designed to capture any outgoing requests
     * to our real servers and then we will later perform some replay
     * attacks and other manipulations of the body.
     */
    this.app.use('*', (req) => {
      // Because of how signing works we must buffer the entire thing first...
      let buffer = new Buffer(0);

      req.on('data', b => {
        buffer = Buffer.concat(buffer, b);
      });

      req.on('end', () => {
        let request = new Request(
          req.method,
          req.originalUrl,
          req.headers,
          buffer
        );
        this.requests.push(request);
        this.emit('request', request);
      });
    });
  }
}

export default async function() {
  // XXX: Express is good place to start but it might be better to devise an
  // even lower level api for some types of testing...
  let app = express();
  let intercept = new Intercept(app);
  let url = await launchApp(app);
  return { intercept, url };
}
