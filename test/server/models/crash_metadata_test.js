import assert from 'assert';
import CrashMetadata from '../../../src/server/models/crash_metadata';
import createDb from '../../../src/server/db';

suite('metadata', () => {
  let config = require('../../../src/server/config')('test');

  let subject, db;
  setup(async () => {
    db = await createDb(config);
    subject = new CrashMetadata(config, db);
  });

  test('put / get / find', async () => {
    let deviceId = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01';
    let type = 'tombstone';

    let records = [
      {
        deviceId,
        type,
        timeStamp: new Date(0),
        url: 'http://example.com/one'
      },
      {
        deviceId,
        type,
        timeStamp: new Date(100),
        url: 'http://example.com/two'
      },
      {
        deviceId,
        type,
        timeStamp: new Date(200),
        url: 'http://example.com/three'
      },
    ];

    await Promise.all(records.map(async record => {
      record.id = await subject.put(record);
    }));

    await Promise.all(records.map(async record => {
      let find = await subject.get(record.id);
      assert.deepEqual(find, record);
    }));

    let results = await subject.find({
      deviceId,
      type,
      startTimeStamp: records[2].timeStamp,
    });
    assert.equal(results.length, 1, 'Found 1 result');
    assert.deepEqual(results[0], records[2]);

    results = await subject.find({
      deviceId,
      type,
      startTimeStamp: records[1].timeStamp,
      endTimeStamp: records[1].timeStamp,
    });
    assert.equal(results.length, 1, 'Found 1 result');
    assert.deepEqual(results[0], records[1]);

    results = await subject.find({
      deviceId,
      type,
      startTimeStamp: records[0].timeStamp,
      endTimeStamp: records[0].timeStamp,
    });
    assert.equal(results.length, 1, 'Found 1 result');
    assert.deepEqual(results[0], records[0]);

    results = await subject.find({
      deviceId,
      type,
      startTimeStamp: new Date(400)
    });
    assert.equal(results.length, 0, 'Found no result');
  });
});
