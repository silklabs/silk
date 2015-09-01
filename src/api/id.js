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

'use strict';

var crypto = require('crypto');
var EC = require('elliptic').ec;
var ec = new EC('ed25519');

function sha256(text) {
  var hasher = crypto.createHash('sha256');
  hasher.update(text);
  return hasher.digest('hex');
}

class Id {
  constructor(pub, priv) {
    this.pub = pub;
    this.priv = priv;
  }

  export() {
    var obj = { hash: this.hash, pub: this.pub };
    if (this.priv) {
      obj.priv = this.priv;
    }
    return JSON.stringify(obj);
  }

  toString() {
    return this.pub;
  }

  sign(token) {
    if (!this.priv) {
      throw new Error('no private key for device id ' + this.hash);
    }
    var key = ec.keyFromPrivate(this.priv, 'hex');
    return key.sign(sha256(token), 'hex');
  }

  verify(token, signature) {
    if (!this.pub) {
      throw new Error('no public key for device id ' + this.hash);
    }
    try {
      var key = ec.keyFromPublic(this.pub, 'hex');
      return key.verify(sha256(token), signature, 'hex');
    } catch(e) {
      return false;
    }
  }

  isValid() {
    if (this.priv) {
      var key = ec.keyFromPrivate(this.priv, 'hex');
      if (key.getPublic(true, 'hex') !== this.pub) {
        return false;
      }
    }
    return !!this.pub;
  }
}

module.exports = {
  create: function() {
    var key = ec.genKeyPair();
    return new Id(key.getPublic(true, 'hex'), key.getPrivate('hex'));
  },
  import: function(json) {
    var obj = JSON.parse(json);
    return new Id(obj.pub, obj.priv);
  },
  importPub: pubKey => {
    return new Id(pubKey);
  },
};
