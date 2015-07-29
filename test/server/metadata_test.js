import assert from 'assert';
import createContext from './context';

suite('metadata apis', () => {
  let context = createContext();
  let id;
  setup(async () => {
    let device = await context.createDevice();
    id = device.toString();
  });

  suite('/device/metadata/*', () => {
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

      let insert = await context.post('/device/metadata/', first);
      assert.equal(insert.statusCode, 201, 'creates record');
      assert.ok(insert.body.id, 'has id');
      first.id = insert.body.id;
    });

    test('find/byid - found', async () => {
      let findById = await context.post('/device/metadata/find/byid', {
        id: first.id
      });

      assert.equal(findById.statusCode, 200, 'found record');
      assert.deepEqual(findById.body.data, first.data);
    });

    test('find/byid - missing', async () => {
      let findById = await context.post('/device/metadata/find/byid', {
        // must be 12 byte string to make mongodb accept the value
        id: 'aaaaaaaaaaaa'
      });
      assert.equal(findById.statusCode, 404, 'record not found');
    });

    test('find/bytime - missing (outside of time)', async () => {
      let findById = await context.post('/device/metadata/find/bytime', {
        metaType: 'video',
        deviceId: id,
        time: first.endUTC
      });
      assert.equal(findById.statusCode, 404, 'record not found');
    });

    test('find/bytime - missing wrong type', async () => {
      let findByTime = await context.post('/device/metadata/find/bytime', {
        metaType: 'log',
        deviceId: id,
        time: first.endUTC - 2
      });

      assert.equal(findByTime.statusCode, 200);
      assert.deepEqual(findByTime.body.data, first.data);
    });

    test('find/bytime - found', async () => {
      let findByTime = await context.post('/device/metadata/find/bytime', {
        metaType: first.metaType,
        deviceId: id,
        time: first.endUTC - 2
      });

      assert.equal(findByTime.statusCode, 200);
      assert.deepEqual(findByTime.body.data, first.data);
    });

    test('find next', async () => {
      let next = Object.assign({}, first, {
        startUTC: 10,
        endUTC: 20,
        data: { woot: true }
      });
      delete next.id;
      next.previousId = first.id;
      let insert = await context.post('/device/metadata/', next);
      assert.equal(insert.statusCode, 201);

      let findFirst = await context.post('/device/metadata/find/byid', {
        id: first.id
      });

      let findSecond = await context.post('/device/metadata/find/byid', {
        id: findFirst.body.nextId
      });
      assert.equal(findSecond.statusCode, 200);
      assert.deepEqual(findSecond.body.data, next.data);
    });
  });

});
