/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var crypto = require('crypto');
var EC = require('elliptic').ec;
var Promise = require('promise');

// TODO make me a util helper
function sha256(buf) {
  var hasher = crypto.createHash('sha256');
  hasher.update(buf);
  return hasher.digest();
}

function toBase64(data) {
  //eslint-disable-line no-unused-vars
  return new Buffer(data, 'binary').toString('base64');
}

var IV_NUM_BYTES = 16;

var SessionCrypto = (function () {
  function SessionCrypto(curve) {
    _classCallCheck(this, SessionCrypto);

    this.ec = new EC(curve);
    this.key = this.ec.genKeyPair();
    this.sharedKey = null;
  }

  _createClass(SessionCrypto, [{
    key: 'exportPublic',
    value: function exportPublic() {
      return this.key.getPublic(true, 'binary');
    }
  }, {
    key: 'deriveShared',
    value: function deriveShared(otherPublicKey) {
      otherPublicKey = this.ec.keyFromPublic(otherPublicKey, 'binary').getPublic();
      this.sharedKey = sha256(new Buffer(this.key.derive(otherPublicKey)));
    }
  }, {
    key: 'encrypt',
    value: function encrypt(cleartext) {
      var _this = this;

      if (!this.sharedKey) {
        throw new Error('No key');
      }
      return new Promise(function (resolve, reject) {
        crypto.randomBytes(IV_NUM_BYTES, function (err, random) {
          if (err) {
            return reject(err);
          }
          var aes = crypto.createCipheriv('aes-256-cbc', _this.sharedKey, random);
          var ciphertext = aes.update(cleartext, 'utf8', 'binary');
          ciphertext += aes.final('binary');
          ciphertext += random.toString('binary');
          resolve(ciphertext);
        });
      });
    }
  }, {
    key: 'decrypt',
    value: function decrypt(ciphertext) {
      if (!this.sharedKey) {
        throw new Error('No key');
      }
      var iv = ciphertext.slice(-IV_NUM_BYTES);
      ciphertext = ciphertext.slice(0, -IV_NUM_BYTES);
      var aes = crypto.createDecipheriv('aes-256-cbc', this.sharedKey, iv);
      var cleartext = aes.update(ciphertext, 'binary', 'utf8');
      cleartext += aes.final('utf8');
      return cleartext;
    }
  }]);

  return SessionCrypto;
})();

module.exports = {
  create: function create(curve) {
    return new SessionCrypto(curve);
  }
};
