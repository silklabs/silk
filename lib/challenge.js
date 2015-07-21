/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var crypto = require('crypto');

// Return the sha256 hex hash of a string.
function sha256(text) {
  var sha1 = crypto.createHash('sha256');
  sha1.update(text);
  return sha1.digest('hex');
}

// Import the authentication key.
var key = require('./secrets').authenticationKey;

// Issue a challenge to a receiver. This will return a unique signed
// token that we can verify later as authentic and issued by us.
export function issue(receiver) {
  var token = crypto.randomBytes(32).toString('hex');
  var enc = sha256(receiver + token + key);
  return [token, enc].join(' ');
}

// Verify that a token was issued by us to a specific receiver.
export function verify(receiver, receipt) {
  var parts = receipt.split(' ');
  if (parts.length < 2 || parts[0].length !== 64 || parts[1].length !== 64) {
    return false;
  }
  var token = parts[0];
  var enc = parts[1];
  return sha256(receiver + token + key) === enc;
}
