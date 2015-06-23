/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let util = require('./util');

function challengeReply(id, receipt, passphrase) {
  return id.sign(util.sha256(passphrase) +' '+ receipt);
}

function run(test) {
  let id = null;
  let receipt = null, receipt2 = null;

  return util.createAccount('test@example.org', 'Test', 'passphrase').then(accId => {
    id = accId;
    // Have to supply required parameters.
    return util.post('/account/challenge', {});
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Id must be valid.
    return util.post('/account/challenge',
                     { id: 'garbage' });
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Challenge succeeds.
    return util.post('/account/challenge',
                     { id: id.toString() });
  }).then(r => {
    test.equal(200, r.statusCode);
    receipt = r.body.receipt;
    test.equal('string', typeof receipt);
    test.ok(receipt.length > 32);
    // Second challenge succeeds.
    return util.post('/account/challenge',
                     { id: id.toString() });
  }).then(r => {
    test.equal(200, r.statusCode);
    receipt2 = r.body.receipt;
    test.equal('string', typeof receipt2);
    test.ok(receipt2.length > 32);
    // Id must be valid.
    return util.post('/account/authenticate',
                       { id: 'garbage',
                         receipt: receipt,
                         sig: challengeReply(id, receipt, 'passphrase') });
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Receipt must be valid.
    return util.post('/account/authenticate',
                     { id: id.toString(),
                       receipt: 'garbage',
                       sig: challengeReply(id, receipt, 'passphrase') });
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Signature must be valid.
    return util.post('/account/authenticate',
                     { id: id.toString(),
                       receipt: receipt,
                       sig: 'garbage' });
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Authenticating with first receipt works.
    return util.post('/account/authenticate',
                     { id: id.toString(),
                       receipt: receipt,
                       sig: challengeReply(id, receipt, 'passphrase') });
  }).then(r => {
    test.equal(200, r.statusCode);
    test.equal('string', typeof r.body.session);
    test.equal(r.body.session.length, 64);
    // Fail to authenticate second receipt even though this is a valid
    // reply.  (Challenge expired.)
    return util.post('/account/authenticate',
                     { id: id.toString(),
                       receipt: receipt2,
                       sig: challengeReply(id, receipt2, 'passphrase') });
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Fail to authenticate first receipt a second time.  (Replay
    // attack.)
    return util.post('/account/authenticate',
                     { id: id.toString(),
                       receipt: receipt,
                       sig: challengeReply(id, receipt, 'passphrase') });
  }).then(r => {
    test.notEqual(200, r.statusCode);
  });
}

exports.test = function(test) {
  test.expect(16);
  util.setup(test).then(() => run(test)).then(() => util.finish(test));
}
