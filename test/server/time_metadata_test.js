import assert from 'assert';
import createContext from './context';

const SERVER_PATH_PREFIX = '/device/metadata/time';

suite('time metadata apis', () => {
  let context = createContext();
  let device, account;
  setup(async function() {
    let pair = await context.testPair();
    device = pair.device;
    account = pair.account;
  });

  let id;
  setup(async () => {
    id = device.accessToken.toString();
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

      let insert = await device.api.metadataPublisher.create(first);
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
      let insert = await device.api.metadataPublisher.create(next);
      next.id = insert.id;
      return next;
    }

    test('find/bytime/after - found', async () => {
      let findAfterTime = await account.api.metadata.findOneAfterTime({
        deviceId: id,
        metaType: 'video',
        time: first.startUTC - 1
      });
      assert.deepEqual(findAfterTime.data, first.data);
    });

    test('find/bytime/after - wrong type', async () => {
      await context.httpErrCode(404, async () => {
        await account.api.metadata.findOneAfterTime({
          deviceId: id,
          metaType: 'log',
          time: first.startUTC - 1
        });
      });
    });

    test('find/bytime/after - after time', async () => {
      await context.httpErrCode(404, async () => {
        await account.api.metadata.findOneAfterTime({
          deviceId: id,
          metaType: 'video',
          time: first.startUTC + 1
        });
      });
    });

    test('find/bytime/before - found', async () => {
      let items = await account.api.metadata.findAllBeforeTime({
        deviceId: id,
        metaType: 'video',
        time: first.endUTC + 1,
        maxCount: 1
      });
      assert.equal(items.length, 1);
      assert.deepEqual(items[0].data, first.data);
    });

    test('find/bytime/before - wrong type', async () => {
      let items = await account.api.metadata.findAllBeforeTime({
        deviceId: id,
        metaType: 'log',
        time: first.endUTC + 1,
        maxCount: 1
      });
      assert.equal(items.length, 0);
    });

    test('find/bytime/before - before time', async () => {
      let items = await account.api.metadata.findAllBeforeTime({
        deviceId: id,
        metaType: 'video',
        time: first.startUTC - 1,
        maxCount: 1
      });
      assert.equal(items.length, 0);
    });

    test('find/byid - found', async () => {
      let findById = await account.api.metadata.findById(first.id);
      assert.deepEqual(findById.data, first.data);
    });

    test('find/byid - missing', async () => {
      await context.httpErrCode(404, async () => {
        await account.api.metadata.findById(
          // must be 12 byte string to make mongodb accept the value
          'aaaaaaaaaaaa'
        );
      });
    });

    test('find/near - missing (outside of time)', async () => {
      await context.httpErrCode(404, async () => {
        await account.api.metadata.findOneNear({
          metaType: 'video',
          deviceId: id,
          strict: true,
          time: first.endUTC
        });
      });
    });

    test('find/near - missing wrong type', async () => {
      await context.httpErrCode(404, async () => {
        await account.api.metadata.findOneNear({
          metaType: 'log',
          deviceId: id,
          time: first.endUTC - 2
        });
      });
    });

    test('find/near - found', async () => {
      let findByTime = await account.api.metadata.findOneNear({
        metaType: first.metaType,
        deviceId: id,
        time: first.endUTC - 2
      });
      assert.deepEqual(findByTime.data, first.data);
    });

    test('find/bytime/before - found next', async () => {
      let next = await insertNext();
      let items = await account.api.metadata.findAllBeforeTime({
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
      let items = await account.api.metadata.findAllBeforeTime({
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
      let items = await account.api.metadata.findAllBeforeTime({
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
      let items = await account.api.metadata.findAllBeforeTime({
        deviceId: id,
        metaType: 'video',
        time: first.startUTC - 1,
        maxCount: 2
      });
      assert.equal(items.length, 0);
    });
  });
});
