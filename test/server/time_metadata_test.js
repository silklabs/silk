import assert from 'assert';
import createContext from './context';
import createMetadataApi from '../../src/api/time_metadata';

const SERVER_PATH_PREFIX = '/device/metadata/time';

suite('time metadata apis', () => {
  let context = createContext();
  let id;
  let api;
  setup(async () => {
    let device = await context.createDevice();
    id = device.toString();
    api = createMetadataApi({ serverUrl: context.url }); //eslint-disable-line 
  });

  suite(`${SERVER_PATH_PREFIX}/*`, () => {
    let first;
    setup(async () => {
      first = {
        deviceId: id,
        metaType: 'video',
        startUTC: 0,
        endUTC: 10,
        url: 'xfoo',
        data: {
          blob: true
        }
      };

      let insert = await context.post(SERVER_PATH_PREFIX, first);
      assert.equal(insert.statusCode, 201, 'creates record');
      assert.ok(insert.body.id, 'has id');
      first.id = insert.body.id;
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

    test('find next', async () => {
      let next = Object.assign({}, first, {
        startUTC: 10,
        endUTC: 20,
        data: { woot: true }
      });
      delete next.id;
      next.previousId = first.id;
      await api.create(next);

      let findFirst = await context.post(`${SERVER_PATH_PREFIX}/find/byid`, {
        id: first.id
      });

      let findSecond = await context.post(`${SERVER_PATH_PREFIX}/find/byid`, {
        id: findFirst.body.nextId
      });
      assert.equal(findSecond.statusCode, 200);
      assert.deepEqual(findSecond.body.data, next.data);
    });
  });

});
