import assert from 'assert';
import Accounts from '../../../src/server/models/accounts';
import createContext from '../context';
import id from '../../../src/api/id';

suite('accounts', () => {
  let context = createContext();

  let subject;
  setup(async () => {
    subject = new Accounts(context.db);
  });

  test('#create / #checkPassword', async () => {
    let key = id.create();
    let input = {
      publicKey: key.toString(),
      email: 'user@example.com',
      passwordHash: context.passwordHash('password'),
      userAgent: 'nodejs'
    };

    let authBeforeCreate = await subject.checkPassword({
      publicKey: input.publicKey,
      email: input.email,
      passwordHash: input.passwordHash
    });
    assert.ok(authBeforeCreate.error, 'fails to checkPassword');

    let account = await subject.create(input);
    assert.ok(account.id, 'Creates account and returns id');
    assert.ok(!account.error, 'Has no errors');

    let duplicate = await subject.create(input);
    assert.ok(duplicate.error, 'has errors');

    let successfulAuth = await subject.checkPassword({
      publicKey: input.publicKey,
      email: input.email,
      passwordHash: input.passwordHash
    });
    assert.equal(successfulAuth.id, account.id);
    let unsuccessfulAuth = await subject.checkPassword({
      publicKey: input.publicKey,
      email: input.email,
      passwordHash: context.passwordHash('other')
    });
    assert.ok(unsuccessfulAuth.error, 'fails to auth');
  });
});

