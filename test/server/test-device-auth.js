/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let util = require('./util');

function run(test) {
  let session = null;
  let id = null;
  let receipt = null, receipt2 = null;

  return util.createDevice().then(deviceId => {
    id = deviceId;
    // Have to supply required parameters.
    return util.post('/device/challenge', {});
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Id must be valid.
    return util.post('/device/challenge',
                     { id: 'garbage' });
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Challenge succeeds.
    return util.post('/device/challenge',
                     { id: id.toString() });
  }).then(r => {
    test.equal(200, r.statusCode);
    receipt = r.body.receipt;
    test.equal('string', typeof receipt);
    test.ok(receipt.length > 32);
    // Second challenge succeeds.
    return util.post('/device/challenge',
                     { id: id.toString() });
  }).then(r => {
    test.equal(200, r.statusCode);
    receipt2 = r.body.receipt;
    test.equal('string', typeof receipt2);
    test.ok(receipt2.length > 32);
    // Id must be valid.
    return util.post('/device/authenticate',
                     { id: 'garbage',
                       receipt: receipt,
                       sig: id.sign(receipt) });
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Receipt must be valid.
    return util.post('/device/authenticate',
                     { id: id.toString(),
                       receipt: 'garbage',
                       sig: id.sign(receipt) });
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Signature must be valid.
    return util.post('/device/authenticate',
                     { id: id.toString(),
                       receipt: receipt,
                       sig: 'garbage' });
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Authenticating with first receipt works.
    return util.post('/device/authenticate',
                     { id: id.toString(),
                       receipt: receipt,
                       sig: id.sign(receipt) });
  }).then(r => {
    test.equal(200, r.statusCode);
    test.equal('string', typeof r.body.session);
    test.equal(r.body.session.length, 64);
    // Fail to authenticate second receipt even though this is a valid
    // reply.  (Challenge expired.)
    return util.post('/device/authenticate',
                     { id: id.toString(),
                       receipt: receipt2,
                       sig: id.sign(receipt) });
  }).then(r => {
    test.notEqual(200, r.statusCode);
    // Fail to authenticate first receipt a second time.  (Replay
    // attack.)
    return util.post('/device/authenticate',
                     { id: id.toString(),
                       receipt: receipt,
                       sig: id.sign(receipt) });
  }).then(r => {
    test.notEqual(200, r.statusCode);
  });
}

exports.test = function(test) {
  test.expect(16);
  util.setup(test).then(() => run(test)).then(() => util.finish(test));
}
