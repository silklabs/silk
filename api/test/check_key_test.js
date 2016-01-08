
import assert from 'assert';
import Id from '../src/access_token';

suite('check key', () => {

  test('valid sig', () => {
    const NONCE = '12345';
    const NAME = 'name';
    const TOKEN = NONCE + ' ' + NAME;

    let id = Id.create();
    let pub = id.pub;
    let sig = id.sign(TOKEN);

    let checkId = Id.importPub(pub);
    assert(checkId.isValid());
    assert(checkId.verify(TOKEN, sig));
  });

  test('garbage key', () => {
    let id = Id.importPub('garbage: no 64 hex chars');
    assert(!id.isValid(), 'garbage key is not considered valid');
    assert.throws(() => id.verify('token', 'garbage'), TypeError);
    assert.throws(
      () => id.verify('token', '012345678901234567890123456789012345678901234567890123456789abcd012345678901234567890123456789012345678901234567890123456789abcd'),
      assert.AssertionError
    );
  });

  test('garbage signature', () => {
    let id = Id.importPub('0123401234012340123401234012340123401234012340123401234012340123');
    assert(id.isValid(), '64 byte hex key is valid');
    assert.throws(() => id.verify('token', 'garbage'), TypeError);
    assert(!id.verify('token', '012345678901234567890123456789012345678901234567890123456789abcd012345678901234567890123456789012345678901234567890123456789abcd'));
  });

});
