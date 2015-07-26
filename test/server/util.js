/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import crypto from 'crypto';
import request from 'request';
import api from '../../api';
import createServer from '../../lib/server';

let PORT = 8888;
export const serverUrl = 'http://localhost:' + PORT;

export function sha256(text) {
  var sha1 = crypto.createHash('sha256');
  sha1.update(text);
  return sha1.digest('hex');
}

function req(params) {
  return new Promise(function(resolve, reject) {
    request(params, (err, res, body) => { //eslint-disable-line no-unused-vars
      if (err) {
        return reject(err);
      }
      return resolve(res);
    });
  });
}

export function post(res, json) {
  return req({ uri: serverUrl + res, method: 'POST', json: json });
}

export function createAccount(email, name, passphrase) {
  let id = api.id.create();
  let passhash = sha256(passphrase);
  return post('/account/create',
              { id: id.toString(), email: email, name: name,
                passhash: passhash, sig: id.sign(passhash) }).then(r => {
                  if (201 !== r.statusCode) {
                    throw new Error('Could not create account ' + email);
                  }
                  return id;
                });
}

export function createAccountAndAuth() {
  let id = null;
  return createAccount('test@example.org', 'Test', 'passphrase').then(accId => {
    id = accId;
    return post('/account/challenge',
                { id: id.toString() });
  }).then(r => {
    if (200 !== r.statusCode) {
      throw new Error('Could not challenge fake account');
    }
    let receipt = r.body.receipt;
    let sig = id.sign(sha256('passphrase') + ' ' + receipt);
    return post('/account/authenticate',
                { id: id.toString(), receipt: receipt, sig: sig });
  }).then(r => {
    if (200 !== r.statusCode) {
      throw new Error('Could not authenticate fake account');
    }
    return r.body.session;
  });
}

export function createDevice() {
  let id = api.id.create();
  return createAccountAndAuth().then(session => {
    return post('/account/device/register',
                { session: session,
                  name: 'Test device',
                  deviceId: id.toString(),
                  sig: id.sign(id.toString()) });
  }).then(r => {
    if (201 !== r.statusCode) {
      throw new Error('Could not create device');
    }
    return id;
  });
}

export async function setup() {
  let server = await createServer(PORT).then();
  return { http: server };
}

export function finish(context) {
  context.http.close();
}
