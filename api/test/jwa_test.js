import assert from 'assert';
import AccessToken from '../src/access_token';
import base64url from 'base64url';

import jwa from '../src/jwa';
import jwt from 'silk-jsonwebtoken';

suite('jwa via jwt', () => {
  test('valid', async () => {
    const keys = await AccessToken.gen();
    let payload = { foo: true };

    let signature = jwt.sign(
      payload,
      new Buffer(keys.priv, 'hex'),
      {
        algorithm: 'ed25519',
        jwa: jwa
      }
    );

    let result = jwt.verify(
      signature,
      new Buffer(keys.pub, 'hex'),
      {
        algorithms: ['ed25519'],
        jwa: jwa
      }
    );
    assert.equal(result.foo, true);
  });

  test('invalid - garbage sig', async () => {
    const keys = await AccessToken.gen();
    assert.throws(() => {
      jwt.verify(
        'garbage',
        new Buffer(keys.pub, 'hex'),
        {
          algorithms: ['ed25519'],
          jwa: jwa
        }
      );
    }, /malformed/);
  });

  test('invalid - mismatched sig', async () => {
    const keys = await AccessToken.gen();

    let signature = jwt.sign(
      {},
      new Buffer(keys.priv, 'hex'),
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
        new Buffer(keys.pub, 'hex'),
        {
          algorithms: ['ed25519'],
          jwa: jwa
        }
      );
    }, /signature/);
  });

});
