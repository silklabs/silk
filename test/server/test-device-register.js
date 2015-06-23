/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let api = require('../../api');
let util = require('./util');

function run(test) {
  let id = api.id.create(), id2 = api.id.create();
  let session = null;
  return util.createAccountAndAuth().then(sessionId => {
    session = sessionId;
    // Have to pass params.
    return util.post('/account/device/register', {});
  }).then(r => {
    test.notEqual(201, r.statusCode);
    // Have to pass valid session ID.
    return util.post('/account/device/register',
                     { session: 'garbage',
                       name: 'Device Name',
                       deviceId: id.toString(),
                       sig: id.sign(id.toString()) });
  }).then(r => {
    test.notEqual(201, r.statusCode);
    // Have to pass valid device ID.
    return util.post('/account/device/register',
                     { session: session,
                       name: 'Device Name',
                       deviceId: 'garbage',
                       sig: id.sign(id.toString()) });
  }).then(r => {
    test.notEqual(201, r.statusCode);
    // Have to pass valid signature.
    return util.post('/account/device/register',
                     { session: session,
                       name: 'Device Name',
                       deviceId: id.toString(),
                       sig: 'garbage' });
  }).then(r => {
    test.notEqual(201, r.statusCode);
    // Creating device works.
    return util.post('/account/device/register',
                     { session: session,
                       name: 'Device Name',
                       deviceId: id.toString(),
                       sig: id.sign(id.toString()) });
  }).then(r => {
    test.equal(201, r.statusCode);
    // ID collision.
    return util.post('/account/device/register',
                     { session: session,
                       name: 'Device Name',
                       deviceId: id.toString(),
                       sig: id.sign(id.toString()) });
  }).then(r => {
    test.notEqual(201, r.statusCode);
    // Second device is created.
    return util.post('/account/device/register',
                     { session: session,
                       name: 'Device Name',
                       deviceId: id2.toString(),
                       sig: id2.sign(id2.toString()) });
  }).then(r => {
    test.equal(201, r.statusCode);
  });
}

exports.test = function(test) {
  test.expect(7);
  util.setup(test).then(() => run(test)).then(() => util.finish(test));
}
