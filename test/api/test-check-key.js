/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let Id = require('../../api').id;

function checkValidSig(test) {
  const NONCE = '12345';
  const NAME = 'name';
  const TOKEN = NONCE +' '+ NAME;

  let id = Id.create();
  let pub = id.pub;
  let sig = id.sign(TOKEN);
  
  let checkId = Id.importPub(pub);
  test.ok(checkId.isValid());
  test.ok(checkId.verify(TOKEN, sig));
}

function checkGarbageSig(test) {
  let id = Id.importPub('garbage');
  test.ok(!id.verify('garbage', 'trash'));
}

exports.test = test => {
  test.expect(3);
  checkValidSig(test);
  checkGarbageSig(test); 
  test.done();
}

