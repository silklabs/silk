/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var crypto = require('crypto');
var elliptic = require('elliptic');
var Promise = require('promise');

// TODO make me a util helper
function sha256(buf) {
  var hasher = crypto.createHash('sha256');
  hasher.update(buf);
  return hasher.digest();
}

function toBase64(data) {
  return new Buffer(data, 'binary').toString('base64');
}

const IV_NUM_BYTES = 16;

class SessionCrypto {
  constructor(curve) {
    this.ec = new elliptic.ec(curve);
    this.key = this.ec.genKeyPair();
    this.sharedKey = null;
  }

  exportPublic() {
    return this.key.getPublic(true, 'binary');
  }
  
  deriveShared(otherPublicKey) {
    otherPublicKey = this.ec.keyFromPublic(otherPublicKey, 'binary').getPublic();
    this.sharedKey = sha256(new Buffer(this.key.derive(otherPublicKey)));
  }

  encrypt(cleartext) {
    if (!this.sharedKey) {
      throw new Error('No key');
    }
    return new Promise((resolve, reject) => {
      crypto.randomBytes(IV_NUM_BYTES, (err, random) => {
        if (err) {
          return reject(err);
        }
        var aes = crypto.createCipheriv('aes-256-cbc', this.sharedKey, random);
        var ciphertext = aes.update(cleartext, 'utf8', 'binary');
        ciphertext += aes.final('binary');
        ciphertext += random.toString('binary');
        resolve(ciphertext);
      });
    });
  }

  decrypt(ciphertext) {
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
}

module.exports = {
  create: (curve) => {
    return new SessionCrypto(curve);
  }
};
