import assert from 'assert';
import createContext from './context';
import { create as createId } from '../../src/api/id';

const SERVER_PATH_PREFIX = '/device/metadata/crashreport';

suite('crash metadata apis', () => {
  const context = createContext();
  let id;
  setup(() => {
    id = createId().toString();
  });

  suite(`${SERVER_PATH_PREFIX}/*`, () => {
    let first, second;
    setup(async () => {
      first = {
        deviceId: id,
        type: 'tombstone',
        timeStamp: new Date(100).toISOString(),
        url: 'https://example.com/blob/100',
      };

      let insert = await context.post(SERVER_PATH_PREFIX, first);
      assert.strictEqual(insert.statusCode, 201, 'creates record');
      assert.ok(insert.body.id, 'has id');
      assert.ok(insert.headers.location, `has 'Location' header`);
      let url = `${SERVER_PATH_PREFIX}/${insert.body.id}`;
      assert.equal(insert.headers.location.substr(-1 * url.length), url);
      first.id = insert.body.id;

      second = {
        deviceId: id,
        type: 'tombstone',
        timeStamp: new Date(200).toISOString(),
        url: 'https://example.com/blob/200',
      };

      insert = await context.post(SERVER_PATH_PREFIX, second);
      assert.strictEqual(insert.statusCode, 201, 'creates record');
      assert.ok(insert.body.id, 'has id');
      assert.ok(insert.headers.location, `has 'Location' header`);
      url = `${SERVER_PATH_PREFIX}/${insert.body.id}`;
      assert.equal(insert.headers.location.substr(-1 * url.length), url);
      second.id = insert.body.id;
    });

    test(`${SERVER_PATH_PREFIX} POST - non-hex deviceId`, async () => {
      let data = {
        deviceId: 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123',
        type: 'tombstone',
        timeStamp: new Date(200).toISOString(),
        url: 'https://example.com/blob/200',
      };
      let insert = await context.post(SERVER_PATH_PREFIX, data);
      assert.strictEqual(insert.statusCode, 400, 'no record created');
    });

    test(`${SERVER_PATH_PREFIX} POST - too short deviceId`, async () => {
      let data = {
        deviceId: 'abcdef',
        type: 'tombstone',
        timeStamp: new Date(200).toISOString(),
        url: 'https://example.com/blob/200',
      };
      let insert = await context.post(SERVER_PATH_PREFIX, data);
      assert.strictEqual(insert.statusCode, 400, 'no record created');
    });

    test(`${SERVER_PATH_PREFIX} POST - too long deviceId`, async () => {
      let data = {
        deviceId: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        type: 'tombstone',
        timeStamp: new Date(200).toISOString(),
        url: 'https://example.com/blob/200',
      };
      let insert = await context.post(SERVER_PATH_PREFIX, data);
      assert.strictEqual(insert.statusCode, 400, 'no record created');
    });

    test(`${SERVER_PATH_PREFIX} POST - no deviceId`, async () => {
      let data = {
        type: 'tombstone',
        timeStamp: new Date(200).toISOString(),
        url: 'https://example.com/blob/200',
      };
      let insert = await context.post(SERVER_PATH_PREFIX, data);
      assert.strictEqual(insert.statusCode, 400, 'no record created');
    });

    test(`${SERVER_PATH_PREFIX} POST - no type`, async () => {
      let data = {
        deviceId: id,
        timeStamp: new Date(200).toISOString(),
        url: 'https://example.com/blob/200',
      };
      let insert = await context.post(SERVER_PATH_PREFIX, data);
      assert.strictEqual(insert.statusCode, 400, 'no record created');
    });

    test(`${SERVER_PATH_PREFIX} POST - bad type`, async () => {
      let data = {
        deviceId: id,
        type: 'foo',
        timeStamp: new Date(200).toISOString(),
        url: 'https://example.com/blob/200',
      };
      let insert = await context.post(SERVER_PATH_PREFIX, data);
      assert.strictEqual(insert.statusCode, 400, 'no record created');
    });

    test(`${SERVER_PATH_PREFIX}/id - found`, async () => {
      const find = await context.get(`${SERVER_PATH_PREFIX}/${first.id}`);
      assert.strictEqual(find.statusCode, 200, 'record found');
      assert.deepEqual(find.body, first);
    });

    test(`${SERVER_PATH_PREFIX}/id - found`, async () => {
      const find = await context.get(`${SERVER_PATH_PREFIX}/${second.id}`);
      assert.strictEqual(find.statusCode, 200, 'record found');
      assert.deepEqual(find.body, second);
    });

    test(`${SERVER_PATH_PREFIX}/id - missing - valid id but 404`, async () => {
      let find = await context.get(`${SERVER_PATH_PREFIX}/aaaaaaaaaaaa`);
      assert.strictEqual(find.statusCode, 404, 'record not found');
    });

    test(`${SERVER_PATH_PREFIX}/id - missing - empty id 404`, async () => {
      let find = await context.get(`${SERVER_PATH_PREFIX}/`);
      assert.strictEqual(find.statusCode, 404, 'record not found');
    });

    test(`${SERVER_PATH_PREFIX}/id - missing - invalid id 404`, async () => {
      let find = await context.get(`${SERVER_PATH_PREFIX}/2342`);
      assert.strictEqual(find.statusCode, 404, 'record not found');
    });

    test(`${SERVER_PATH_PREFIX}/find - found (deviceId)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: id,
      });
      assert.strictEqual(find.body.length, 2, '2 records found');
      assert.deepEqual(find.body[0], second);
      assert.deepEqual(find.body[1], first);
    });

    test(`${SERVER_PATH_PREFIX}/find - missing (deviceId)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01',
      });
      assert.strictEqual(find.body.length, 0, '0 records found');
    });

    test(`${SERVER_PATH_PREFIX}/find - found (type)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: id,
        type: first.type,
      });
      assert.strictEqual(find.body.length, 2, '2 records found');
      assert.deepEqual(find.body[0], second);
      assert.deepEqual(find.body[1], first);
    });

    test(`${SERVER_PATH_PREFIX}/find - missing (type)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: id,
        type: 'exception',
      });
      assert.strictEqual(find.body.length, 0, '0 records found');
    });

    test(`${SERVER_PATH_PREFIX}/find - found (startTimeStamp)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: id,
        type: first.type,
        startTimeStamp: second.timeStamp,
      });
      assert.strictEqual(find.body.length, 1, '1 record found');
      assert.deepEqual(find.body[0], second);
    });

    test(`${SERVER_PATH_PREFIX}/find - missing (startTimeStamp)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: id,
        type: first.type,
        startTimeStamp: new Date().toISOString(),
      });
      assert.strictEqual(find.body.length, 0, 'no records found');
    });

    test(`${SERVER_PATH_PREFIX}/find - found (endTimeStamp)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: id,
        type: first.type,
        startTimeStamp: first.timeStamp,
        endTimeStamp: first.timeStamp,
      });
      assert.strictEqual(find.body.length, 1, '1 record found');
      assert.deepEqual(find.body[0], first);
    });

    test(`${SERVER_PATH_PREFIX}/find - missing (endTimeStamp)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: id,
        type: first.type,
        startTimeStamp: new Date().toISOString(),
        endTimeStamp: new Date(0).toISOString(),
      });
      assert.strictEqual(find.body.length, 0, 'no records found');
    });

    test(`${SERVER_PATH_PREFIX}/find - found (no limit)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: id,
        type: first.type,
        startTimeStamp: first.timeStamp,
        endTimeStamp: second.timeStamp,
      });
      assert.strictEqual(find.body.length, 2, '2 records found');
      assert.deepEqual(find.body[0], second);
      assert.deepEqual(find.body[1], first);
    });

    test(`${SERVER_PATH_PREFIX}/find - found (limit)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: id,
        type: first.type,
        startTimeStamp: first.timeStamp,
        endTimeStamp: second.timeStamp,
        limit: 1
      });
      assert.strictEqual(find.body.length, 1, '1 record found');
      assert.deepEqual(find.body[0], second);
    });

    test(`${SERVER_PATH_PREFIX}/find - (0 limit) 400`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: id,
        type: first.type,
        startTimeStamp: first.timeStamp,
        endTimeStamp: second.timeStamp,
        limit: 0,
      });
      assert.strictEqual(find.statusCode, 400, 'record not found');
    });
  });
});
