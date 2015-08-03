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

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var crypto = require('crypto');
var EC = require('elliptic').ec;
var ec = new EC('ed25519');

function sha256(text) {
  var hasher = crypto.createHash('sha256');
  hasher.update(text);
  return hasher.digest('hex');
}

var Id = (function () {
  function Id(pub, priv) {
    _classCallCheck(this, Id);

    this.pub = pub;
    this.priv = priv;
  }

  _createClass(Id, [{
    key: 'export',
    value: function _export() {
      var obj = { hash: this.hash, pub: this.pub };
      if (this.priv) {
        obj.priv = this.priv;
      }
      return JSON.stringify(obj);
    }
  }, {
    key: 'toString',
    value: function toString() {
      return this.pub;
    }
  }, {
    key: 'sign',
    value: function sign(token) {
      if (!this.priv) {
        throw new Error('no private key for device id ' + this.hash);
      }
      var key = ec.keyFromPrivate(this.priv, 'hex');
      return key.sign(sha256(token), 'hex');
    }
  }, {
    key: 'verify',
    value: function verify(token, signature) {
      if (!this.pub) {
        throw new Error('no public key for device id ' + this.hash);
      }
      var key = ec.keyFromPublic(this.pub, 'hex');
      // Oddly, |verify()| throws for invalid signatures, instead of
      // returning false.
      try {
        return key.verify(sha256(token), signature, 'hex');
      } catch (e) {
        return false;
      }
    }
  }, {
    key: 'isValid',
    value: function isValid() {
      if (this.priv) {
        var key = ec.keyFromPrivate(this.priv, 'hex');
        if (key.getPublic(true, 'hex') !== this.pub) {
          return false;
        }
      }
      return !!this.pub;
    }
  }]);

  return Id;
})();

module.exports = {
  create: function create() {
    var key = ec.genKeyPair();
    return new Id(key.getPublic(true, 'hex'), key.getPrivate('hex'));
  },
  'import': function _import(json) {
    var obj = JSON.parse(json);
    return new Id(obj.pub, obj.priv);
  },
  importPub: function importPub(pubKey) {
    return new Id(pubKey);
  }
};