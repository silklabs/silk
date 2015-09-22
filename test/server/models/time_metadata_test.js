import assert from 'assert';
import TimeMetadata from '../../../src/server/models/time_metadata';
import createContext from '../context';

suite('time metadata', () => {
  let context = createContext();

  let subject;
  setup(async () => {
    subject = new TimeMetadata(context.db);
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

    let outOfBounds = await subject.findNearTime({
      deviceId,
      metaType,
      time: 400
    });
    assert.equal(outOfBounds.url, 'three');
  });

  test('.update', async () => {
    let payload = {
      deviceId: 'bar',
      metaType: 'event',
      startUTC: 123,
    };
    let {id} = await subject.insertNext(payload);
    let record = await subject.findById({id});
    assert.equal(record.deviceId, payload.deviceId);
    assert.equal(record.metaType, payload.metaType);
    assert.equal(record.startUTC, payload.startUTC);
    assert.equal(record.endUTC, undefined);

    let endUTC = 456;
    await subject.update(id, {endUTC});
    record = await subject.findById({id});
    // These fields are unchanged.
    assert.equal(record.id, id);
    assert.equal(record.deviceId, payload.deviceId);
    assert.equal(record.metaType, payload.metaType);
    assert.equal(record.startUTC, payload.startUTC);
    // This one's been updated/set.
    assert.equal(record.endUTC, endUTC);
  });

});
