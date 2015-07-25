/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import assert from 'assert';
import { crypto } from '../../api';

suite('crypto', () => {
  test('encrypt', async () => {
    let a = crypto.create('curve25519');
    let aPublic = a.exportPublic();
    let b = crypto.create('curve25519');
    let bPublic = b.exportPublic();

    a.deriveShared(bPublic);
    b.deriveShared(aPublic);

    let ap = 'Wifi Access Point';
    let secret = 'Hello kitty 12345';

    let apEnc = await a.encrypt(ap);
    let secretEnc = await a.encrypt(secret);

    assert.equal(ap, b.decrypt(apEnc));
    assert.equal(secret, b.decrypt(secretEnc));
  });
});
