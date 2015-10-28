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

  test('#findByPublicKey', async () => {
    let key = id.create();
    let input = {
      publicKey: key.toString(),
      email: 'user@example.com',
      passwordHash: context.passwordHash('password'),
      userAgent: 'nodejs'
    };

    let account = await subject.create(input);
    let byPublicKey = await subject.findByPublicKey({
      publicKey: input.publicKey
    });
    assert.ok(account.id);
    assert.equal(byPublicKey._id, account.id);
  });

  test('#setBeaconUUIDIfMissing', async () => {
    let key = id.create();
    let input = {
      publicKey: key.toString(),
      email: 'user@example.com',
      passwordHash: context.passwordHash('password'),
      userAgent: 'nodejs'
    };
    await subject.create(input);
    // Should not need an update yet...
    assert.ok(!await subject.setBeaconUUIDIfMissing(
      key.toString()
    ));

    await subject.collection.update(
      {
        'accountTokens.publicKey': key.toString()
      },
      {
        $unset: {
          'beaconUUID': ''
        }
      }
    );

    let beaconUUID = await subject.setBeaconUUIDIfMissing(
      key.toString()
    );
    assert.ok(beaconUUID, 'updates beaconUUID');

    let dbAccount;
    dbAccount = await subject.collection.findOne({
      'accountTokens.publicKey': key.toString()
    });
    assert.equal(dbAccount.beaconUUID, beaconUUID);
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

  test('#signIn', async () => {
    let key = id.create();
    let input = {
      publicKey: key.toString(),
      email: 'user@example.com',
      passwordHash: context.passwordHash('password'),
      userAgent: 'nodejs'
    };

    let account = await subject.create(input);
    assert.ok(account.id, 'Creates account and returns id');
    let newKey = id.create();

    let signIn = await subject.signIn(Object.assign(
      {},
      input,
      { publicKey: newKey.toString() }
    ));
    assert.equal(signIn.id, account.id);

    let duplicateErr;
    try {
      await subject.signIn(Object.assign(
        {},
        input,
        { publicKey: newKey.toString() }
      ));
    } catch (err) {
      duplicateErr = err;
    }
    assert.ok(duplicateErr, 'cannot create duplicate keys within document');

    let unknownSignIn = await subject.signIn(Object.assign(
      {},
      input,
      { email: 'user2@example.com' }
    ));
    assert.equal(unknownSignIn.error.type, 'UnknownAccount');

    let badPass = await subject.signIn(Object.assign(
      {},
      input,
      { passwordHash: context.passwordHash('foobar') }
    ));
    assert.equal(badPass.error.type, 'CheckPasswordFailure');

    let accountDetails = await subject.collection.findOne({
      'accountTokens.publicKey': newKey.toString()
    });
    assert.equal(accountDetails._id, signIn.id);
    let publicKeys = accountDetails.accountTokens.map(v => v.publicKey);
    assert.deepEqual(publicKeys, [key.toString(), newKey.toString()]);
  });
});

