/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let api = require('../../api');
let util = require('./util');

function makeParams(id, email, name, passphrase) {
  let passhash = util.sha256(passphrase);
  return { id: id.toString(), email: email, name: name,
           passhash: passhash, sig: id.sign(passhash) };
}

function run(test) {
  var id = api.id.create();
  var id2 = api.id.create();
  // Have to supply required parameters.
  return util.post('/account/create', {}).then(r => {
    test.notEqual(201, r.statusCode);
    // Have to supply valid ID.
    return util.post('/account/create',
                     { id: 'garbage', email: 'test@example.org',
                       name: 'Test', passhash: util.sha256('passphrase'),
                       sig: id.sign(util.sha256('passphrase')) });
  }).then(r => {
    test.notEqual(201, r.statusCode);
    // Have to supply valid passhash.
    return util.post('/account/create',
                     { id: id.toString(), email: 'test@example.org',
                       name: 'Test', passhash: 'garbage',
                       sig: id.sign(util.sha256('passphrase')) });
  }).then(r => {
    test.notEqual(201, r.statusCode);
    // Have to supply valid signature.
    return util.post('/account/create',
                     { id: id.toString(), email: 'test@example.org',
                       name: 'Test', passhash: util.sha256('passphrase'),
                       sig: 'garbage' });
  }).then(r => {
    test.notEqual(201, r.statusCode);
    // Creating basic account works.
    return util.post('/account/create',
                makeParams(id, 'test@example.org', 'Test', 'passphrase'));
  }).then(r => {
    test.equal(201, r.statusCode);
    // Email has already been used to create another account.
    return util.post('/account/create',
                makeParams(id2, 'test@example.org', 'Test', 'passphrase'));
  }).then(r => {
    test.notEqual(201, r.statusCode);
    // ID has already been used for another account.
    return util.post('/account/create',
                makeParams(id, 'test2@example.org', 'Test', 'passphrase'));
  }).then(r => {
    test.notEqual(201, r.statusCode);
    // Creating second account works.
    return util.post('/account/create',
                makeParams(id2, 'test2@example.org', 'Test 2', 'passphrase'));
  }).then(r => {
    test.equal(201, r.statusCode);
    return Promise.resolve();
  });
}

exports.test = function(test) {
  test.expect(8);
  util.setup(test).then(() => run(test)).then(() => util.finish(test));
}
