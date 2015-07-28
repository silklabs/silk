/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let log = require('./log')('server');
let assert = require('assert');
let crypto = require('crypto');

let api = require('../api');
let challenge = require('./challenge');

// Return the sha256 hex hash of a string.
function sha256(text) {
  var sha1 = crypto.createHash('sha256');
  sha1.update(text);
  return sha1.digest('hex');
}

function isPassHash(obj) {
  return ('string' === typeof obj) && obj.length === 64;
}

class Auth {
  constructor() {
    this.receipts = new Set();
    this.session = null;
  }

  challenge() {
    // XXX: for now, this challenge mechanism is a bit excessive
    // because we don't yet have persistent state, or multiple web
    // heads.
    let receipt = challenge.issue(this.id.toString());
    this.receipts.add(receipt);
    return receipt;
  }

  authenticate(receipt, sig) {
    if (!this.receipts.has(receipt)) {
      return null;
    }
    assert(challenge.verify(this.id.toString(), receipt));
    if (!this.verifyChallenge(receipt, sig)) {
      return null;
    }
    this.receipts = new Set();
    this.session = sha256(crypto.randomBytes(32).toString('hex'));
    return this.session;
  }
}

class Account extends Auth {
  constructor(id, email, name, passhash) {
    super();
    this.id = api.id.importPub(id);
    this.email = email;
    this.name = name;
    this.passhash = passhash;
    this.devices = new Set();
  }

  registerDevice(id) {
    this.devices.add(id);
  }

  verifyChallenge(receipt, sig) {
    return this.id.verify(this.passhash + ' ' + receipt, sig);
  }
}

class Device extends Auth {
  constructor(accountId, id, name) {
    super();
    this.accountId = accountId;
    this.id = api.id.importPub(id);
    this.name = name;
  }

  verifyChallenge(receipt, sig) {
    return this.id.verify(receipt, sig);
  }
}

class Accounts {
  constructor() {
    this.accounts = { };
    this.emails = { };
    this.devices = { };
    this.accountSessions = { };
    this.deviceSessions = { };
  }

  create(email, name, passhash, id, sig) {
    if (email in this.emails) {
      log.warn('Email', email, 'already registered');
      return false;
    }
    if (id in this.accounts) {
      // This implies malicious client(s) ... can we do anything about this?
      log.warn('ID', id, 'already registered ... suspicious');
      return false;
    }
    if (!isPassHash(passhash)) {
      log.warn('Invalid passhash for', email);
      return false;
    }
    let key = api.id.importPub(id);
    if (!key.verify(passhash, sig)) {
      log.warn('Failed to verify ID of', email);
      return false;
    }
    this.accounts[id] = new Account(id, email, name, passhash);
    this.emails[email] = id;
    return true;
  }

  challengeAccount(id) {
    return this._challenge(this.accounts, id);
  }

  authenticateAccount(id, receipt, sig) {
    return this._authenticate(this.accounts, this.accountSessions,
                              id, receipt, sig);
  }

  registerDevice(session, name, deviceId, sig) {
    let account = this.accountSessions[session];
    if (!account) {
      log.warn('Invalid session ID');
      return false;
    }
    let key = api.id.importPub(deviceId);
    if (!key.verify(deviceId, sig)) {
      log.warn('Failed to verify ID of device', name);
      return false;
    }
    if (deviceId in this.devices) {
      log.warn('Device ID', deviceId, 'already registered ... suspicious');
      return false;
    }
    this.devices[deviceId] = new Device(account.id.toString(), deviceId, name);
    account.registerDevice(deviceId);
    return true;
  }

  challengeDevice(id) {
    return this._challenge(this.devices, id);
  }

  authenticateDevice(id, receipt, sig) {
    return this._authenticate(this.devices, this.deviceSessions,
                              id, receipt, sig);
  }

  _challenge(group, id) {
    let member = group[id];
    return member ? member.challenge() : null;
  }

  _authenticate(group, sessions, id, receipt, sig) {
    let member = group[id];
    if (!member) {
      return null;
    }
    var prevSession = member.session;
    let newSession = member.authenticate(receipt, sig);
    if (!newSession) {
      return null;
    }
    if (prevSession) {
      delete sessions[prevSession];
    }
    sessions[newSession] = member;
    return newSession;

  }
}

module.exports = () => new Accounts();
