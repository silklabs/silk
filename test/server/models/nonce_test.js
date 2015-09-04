import assert from 'assert';
import Nonce from '../../../src/server/models/nonce';
import createContext from '../context';
import uuid from 'uuid';

suite('accounts', () => {
  let context = createContext();

  let subject;
  setup(async () => {
    subject = new Nonce(context.db);
  });

  test('#insert / check', async () => {
    let record = {
      value: uuid.v1(),
      created: new Date(),
      expires: new Date()
    };

    let insert = await subject.create(record);
    let dup = await subject.create(record);
    let check = await subject.check({ value: record.value });
    let invalid = await subject.check({ value: uuid.v1() });

    assert.ok(insert.id, 'insert will return the id');
    assert.ok(dup.error, 'duplicate will return error');
    assert.ok(check, 'check will return values');
    assert.ok(!invalid, 'non existent uuid will return nothing');
  });

  test('#expireAll', async () => {
    let records = {
      farFuture: {
        value: uuid.v1(),
        created: new Date(),
        expires: new Date(3000)
      },
      farPast: {
        value: uuid.v1(),
        created: new Date(),
        expires: new Date(1980)
      },
      notExpired: {
        value: uuid.v1(),
        created: new Date(),
        expires: new Date(Date.now() + 60 * 1000)
      }
    };

    // Promise.all could have been used but this is clearer if it fails...
    for (var key in records) {
      let insert = await subject.create(records[key]);
      assert.ok(insert, `failed to insert: ${key}`);
    }

    let expire = await subject.expireAll();
    assert.ok(expire, 'expires succesfully');

    let remainder = await subject.collection.find().toArray();
    remainder = remainder.map(v => v.value);
    assert.deepEqual(remainder, [records.notExpired.value]);
  });

});
