/**
 * @flow
 */

import assert from 'assert';
import AccessToken from '../src/access_token';

async function assertThrows(func, ErrorClass) {
  let error;
  try {
    await func();
  } catch (ex) {
    error = ex;
  }
  assert(error instanceof ErrorClass, `Expected ${ErrorClass.name} exception, got ${error}`);
}

suite('check key', () => {

  test('valid sig', async () => {
    const NONCE = '12345';
    const NAME = 'name';
    const TOKEN = NONCE + ' ' + NAME;

    const id = await AccessToken.gen();
    let pub = id.pub;
    let sig = await id.genSign(TOKEN);

    let checkAccessToken = AccessToken.importPub(pub);
    assert(await checkAccessToken.genIsValid());
    assert(await checkAccessToken.genVerify(TOKEN, sig));
  });

  test('garbage key', async () => {
    let id = AccessToken.importPub('garbage: no 64 hex chars');
    assert(!(await id.genIsValid()), 'garbage key is not considered valid');
    await assertThrows(
      () => id.genVerify('token', 'garbage'),
      TypeError
    );
    await assertThrows(
      () => id.genVerify('token', '012345678901234567890123456789012345678901234567890123456789abcd012345678901234567890123456789012345678901234567890123456789abcd'),
      Error
    );
  });

  test('garbage signature', async () => {
    let id = AccessToken.importPub('0123401234012340123401234012340123401234012340123401234012340123');
    assert(await id.genIsValid(), '64 byte hex key is valid');
    await assertThrows(
      () => id.genVerify('token', 'garbage'),
      TypeError
    );
    assert(!(await id.genVerify('token', '012345678901234567890123456789012345678901234567890123456789abcd012345678901234567890123456789012345678901234567890123456789abcd')));
  });

});
