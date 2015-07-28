import assert from 'assert';
import TimeMetadata from '../../../src/server/models/time_metadata';
import createDb from '../../../src/server/db';

suite('time metadata', () => {
  let config = require('../../../src/server/config')('test');

  let subject, db;
  setup(async () => {
    db = await createDb(config);
    subject = new TimeMetadata(db);
  });

  test('.insertNext / findNearTime', async () => {
    let deviceId = 'foo';
    let metaType = 'video';

    let records = [
      {
        deviceId,
        metaType,
        startUTC: 0,
        endUTC: 100,
        url: 'one'
      },
      {
        deviceId,
        metaType,
        startUTC: 100,
        endUTC: 200,
        url: 'two'
      },
      {
        deviceId,
        metaType,
        startUTC: 200,
        endUTC: 300,
        url: 'three'
      },
    ];

    let record, previous;
    while ((record = records.shift())) {
      if (previous) {
        record.previousId = previous.id;
      }

      previous = await subject.insertNext(record);
    }

    let one = await subject.findNearTime({
      deviceId,
      metaType,
      time: 77
    });
    assert.equal(one.url, 'one');

    let two = await subject.findNearTime({
      deviceId,
      metaType,
      time: 100
    });
    assert.equal(two.url, 'two');

    let three = await subject.findNearTime({
      deviceId,
      metaType,
      time: 201
    });
    assert.equal(three.url, 'three');

    // references should line up...
    assert.equal(one.nextId, two.id);
    assert.equal(two.nextId, three.id);
    assert.equal(three.nextId, null);
  });

});
