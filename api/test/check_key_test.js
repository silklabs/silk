
import assert from 'assert';
import Id from '../src/id';

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

  test('garbage sig', () => {
    let id = Id.importPub('garbage');
    assert(!id.verify('garbage', 'trash'));
  });

});
