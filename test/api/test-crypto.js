/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let crypto = require('../../api').crypto;

exports.test = test => {
  test.expect(2);
  
  let a = crypto.create('curve25519');
  let aPublic = a.exportPublic();
  let b = crypto.create('curve25519');
  let bPublic = b.exportPublic();
  
  a.deriveShared(bPublic);
  b.deriveShared(aPublic);
  
  let ap = 'Wifi Access Point';
  let secret = 'Hello kitty 12345';
  
  let apEnc, secretEnc;
  a.encrypt(ap).then(ct => {
    apEnc = ct;
    return a.encrypt(secret);
  }).then(ct => {
    secretEnc = ct;
    test.equals(ap, b.decrypt(apEnc));
    test.equals(secret, b.decrypt(secretEnc));
    test.done();
  });
}
