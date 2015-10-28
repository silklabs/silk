import assert from 'assert';
import id from '../../src/api/id';
import base64url from 'base64url';

import jwa from '../../src/api/jwa';
import jwt from 'jsonwebtoken';

suite('jwa via jwt', () => {
  test('valid', () => {
    let keys = id.create();
    let payload = { foo: true };

    let signature = jwt.sign(
      payload,
      keys.priv,
      {
        algorithm: 'ed25519',
        jwa: jwa
      }
    );

    let result = jwt.verify(
      signature,
      keys.pub,
      {
        algorithms: ['ed25519'],
        jwa: jwa
      }
    );
    assert.equal(result.foo, true);
  });

  test('invalid - garbage sig', () => {
    let keys = id.create();
    assert.throws(() => {
      jwt.verify(
        'garbage',
        keys.pub,
        {
          algorithms: ['ed25519'],
          jwa: jwa
        }
      );
    }, /malformed/);
  });

  test('invalid - mismatched sig', () => {
    let keys = id.create();

    let signature = jwt.sign(
      {},
      keys.priv,
      {
        algorithm: 'ed25519',
        jwa: jwa
      }
    );

    let parts = signature.split('.');
    parts[1] = base64url.encode(JSON.stringify({ hacked: true }));
    let signatureHacked = parts.join('.');

    assert.throws(() => {
      jwt.verify(
        signatureHacked,
        keys.pub,
        {
          algorithms: ['ed25519'],
          jwa: jwa
        }
      );
    }, /signature/);
  });

});
