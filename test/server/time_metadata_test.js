import assert from 'assert';
import createContext from './context';
import createMetadataApi from '../../src/api/time_metadata';

const SERVER_PATH_PREFIX = '/device/metadata/time';

suite('time metadata apis', () => {
  let context = createContext();
  let device;
  setup(async function() {
    device = await context.testDevice();
    context.api.accessToken = device.accessToken;
  });

  let id;
  let api;
  setup(async () => {
    id = device.accessToken.toString();
    api = createMetadataApi({ serverUrl: context.url }); //eslint-disable-line
  });

  suite(`${SERVER_PATH_PREFIX}/*`, () => {
    // NB: this is re-created for each test() in the setup() call
    // below, and the new object is bound to the `first` local here.
    let first;
    setup(async () => {
      first = {
        metaType: 'video',
        startUTC: 100,
        endUTC: 200,
        url: 'xfoo',
        data: {
          blob: true
        }
      };

      let insert = await context.api.metadataPublisher.create(first);
      first.id = insert.id;
      // For easy assertions...
      first.deviceId = device.accessToken;
    });

    async function insertNext() {
      let next = Object.assign({}, first, {
        startUTC: 201,
        endUTC: 300,
        data: { woot: true }
      });
      delete next.id;
      let insert = await context.api.metadataPublisher.create(next);
      next.id = insert.id;
      return next;
    }

    test('find/bytime/after - found', async () => {
      let findAfterTime = await api.findOneAfterTime({
        deviceId: id,
        metaType: 'video',
        time: first.startUTC - 1
      });
      assert.deepEqual(findAfterTime.data, first.data);
    });

    test('find/bytime/after - wrong type', async () => {
      try {
        await api.findOneAfterTime({
          deviceId: id,
          metaType: 'log',
          time: first.startUTC - 1
        });
      } catch (err) {
        assert.equal(err.code, 404);
        return;
      }
      throw new Error('should throw');
    });

    test('find/bytime/after - after time', async () => {
      try {
        await api.findOneAfterTime({
          deviceId: id,
          metaType: 'video',
          time: first.startUTC + 1
        });
      } catch (err) {
        assert.equal(err.code, 404);
        return;
      }
      throw new Error('should throw');
    });

    test('find/bytime/before - found', async () => {
      let items = await api.findBeforeTime({
        deviceId: id,
        metaType: 'video',
        time: first.endUTC + 1,
        maxCount: 1
      });
      assert.equal(items.length, 1);
      assert.deepEqual(items[0].data, first.data);
    });

    test('find/bytime/before - wrong type', async () => {
      let items = await api.findBeforeTime({
        deviceId: id,
        metaType: 'log',
        time: first.endUTC + 1,
        maxCount: 1
      });
      assert.equal(items.length, 0);
    });

    test('find/bytime/before - before time', async () => {
      let items = await api.findBeforeTime({
        deviceId: id,
        metaType: 'video',
        time: first.startUTC - 1,
        maxCount: 1
      });
      assert.equal(items.length, 0);
    });

    test('find/byid - found', async () => {
      let findById = await api.findById({ id: first.id });
      assert.deepEqual(findById.data, first.data);
    });

    test('find/byid - missing', async () => {
      let findById = await context.post(`${SERVER_PATH_PREFIX}/find/byid`, {
        // must be 12 byte string to make mongodb accept the value
        id: 'aaaaaaaaaaaa'
      });
      assert.equal(findById.statusCode, 404, 'record not found');
    });

    test('find/bytime - missing (outside of time)', async () => {
      let findById = await context.post(`${SERVER_PATH_PREFIX}/find/bytime`, {
        metaType: 'video',
        deviceId: id,
        strict: true,
        time: first.endUTC
      });
      assert.equal(findById.statusCode, 404, 'record not found');
    });

    test('find/bytime - missing wrong type', async () => {
      let findByTime = await context.post(`${SERVER_PATH_PREFIX}/find/bytime`, {
        metaType: 'log',
        deviceId: id,
        time: first.endUTC - 2
      });

      assert.equal(findByTime.statusCode, 404);
    });

    test('find/bytime - found', async () => {
      let findByTime = await api.findByTime({
        metaType: first.metaType,
        deviceId: id,
        time: first.endUTC - 2
      });
      assert.deepEqual(findByTime.data, first.data);
    });

    test('find/bytime/before - found next', async () => {
      let next = await insertNext();
      let items = await api.findBeforeTime({
        deviceId: id,
        metaType: 'video',
        time: next.endUTC + 1,
        maxCount: 1
      });
      assert.equal(items.length, 1);
      assert.deepEqual(items[0].data, next.data);
    });

    test('find/bytime/before - found both', async () => {
      let next = await insertNext();
      let items = await api.findBeforeTime({
        deviceId: id,
        metaType: 'video',
        time: next.endUTC + 1,
        maxCount: 2
      });
      assert.equal(items.length, 2);
      assert.deepEqual(items[0].data, next.data);
      assert.deepEqual(items[1].data, first.data);
    });

    test('find/bytime/before - found first', async () => {
      let next = await insertNext();
      let items = await api.findBeforeTime({
        deviceId: id,
        metaType: 'video',
        time: next.startUTC - 1,
        maxCount: 2
      });
      assert.equal(items.length, 1);
      assert.deepEqual(items[0].data, first.data);
    });

    test('find/bytime/before - found none', async () => {
      let next = await insertNext();  // eslint-disable-line
      let items = await api.findBeforeTime({
        deviceId: id,
        metaType: 'video',
        time: first.startUTC - 1,
        maxCount: 2
      });
      assert.equal(items.length, 0);
    });
  });
});
