/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// Module implementing device ids.
//
// A device id is the compact public key of curve ed25519 public/private key
// pair.
//
// Create a new device id:
// var id = require('device-id').create();
//
// Import a device id from a JSON string.
// var id = require('device-id').import(json_string);
//
// Export a device id to a JSON string. Handle with care. The JSON string
// contains the private key if we have it:
// console.log(id.export());
//
// Get the 66 hex digit hash id:
// console.log(id);
//
// Sign a challenge token string with the private key. This throws if we don't
// have the private key:
// var signature = id.sign(token);

import assert from 'assert';
import crypto from 'crypto';
import { ec as EC } from 'elliptic';

const ec = new EC('ed25519');

function sha256(text) {
  var hasher = crypto.createHash('sha256');
  hasher.update(text);
  return hasher.digest('hex');
}

export default class Id {

  static create(options = {}) {
    const key = ec.genKeyPair(options);
    return new Id(key.getPublic(true, 'hex'), key.getPrivate('hex'));
  }

  static import(json) {
    const obj = JSON.parse(json);
    return new Id(obj.pub, obj.priv);
  }

  static importPub(pubKey) {
    return new Id(pubKey);
  }

  constructor(pub, priv) {
    this.pub = pub;
    this.priv = priv;
  }

  export() {
    const obj = {
      pub: this.pub,
      priv: this.priv,
    };
    return JSON.stringify(obj);
  }

  toString() {
    return this.pub;
  }

  sign(token) {
    assert(this.priv, 'no private key');
    const key = ec.keyFromPrivate(this.priv, 'hex');
    return key.sign(sha256(token)).toDER('hex');
  }

  verify(token, signature) {
    assert(this.pub, 'no public key');
    let key;
    try {
      key = ec.keyFromPublic(this.pub, 'hex');
    } catch(e) {
      return false;
    }
    return key.verify(sha256(token), signature);
  }

  isValid() {
    if (this.priv) {
      let key = ec.keyFromPrivate(this.priv, 'hex');
      if (key.getPublic(true, 'hex') !== this.pub) {
        return false;
      }
    }
    return !!this.pub;
  }
}
