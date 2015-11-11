import assert from 'assert';
import createContext from './context';

const SERVER_PATH_PREFIX = '/device/metadata/crashreport';

suite('crash metadata apis', () => {
  const context = createContext();
  let device;
  setup(async function() {
    device = await context.testDevice();
    context.api.accessToken = device.accessToken;
  });

  suite(`${SERVER_PATH_PREFIX}/*`, () => {
    let first, second;
    setup(async () => {
      first = {
        type: 'tombstone',
        timeStamp: new Date(100).toISOString(),
        url: 'https://example.com/blob/100',
      };
      let firstInsert = await context.api.crashPublisher.create(first);
      first.id = firstInsert.id;

      second = {
        type: 'tombstone',
        timeStamp: new Date(200).toISOString(),
        url: 'https://example.com/blob/200',
      };
      let secondInsert = await context.api.crashPublisher.create(second);
      second.id = secondInsert.id;

      // For easy assertion in tests below...
      first.deviceId = second.deviceId = device.accessToken.toString();
    });

    test(`${SERVER_PATH_PREFIX} POST - no type`, async () => {
      let data = {
        timeStamp: new Date(200).toISOString(),
        url: 'https://example.com/blob/200',
      };

      try {
        await context.api.crashPublisher.create(data);
      } catch (err) {
        assert.equal(err.code, 400);
        return;
      }
      throw new Error('expected error');
    });

    test(`${SERVER_PATH_PREFIX}/device.id - found`, async () => {
      const find = await context.get(`${SERVER_PATH_PREFIX}/${first.id}`);
      assert.strictEqual(find.statusCode, 200, 'record found');
      assert.deepEqual(find.body, first);
    });

    test(`${SERVER_PATH_PREFIX}/device.id - found`, async () => {
      const find = await context.get(`${SERVER_PATH_PREFIX}/${second.id}`);
      assert.strictEqual(find.statusCode, 200, 'record found');
      assert.deepEqual(find.body, second);
    });

    test(`${SERVER_PATH_PREFIX}/device.id - missing - valid id but 404`, async () => {
      let find = await context.get(`${SERVER_PATH_PREFIX}/aaaaaaaaaaaa`);
      assert.strictEqual(find.statusCode, 404, 'record not found');
    });

    test(`${SERVER_PATH_PREFIX}/device.id - missing - empty id 404`, async () => {
      let find = await context.get(`${SERVER_PATH_PREFIX}/`);
      assert.strictEqual(find.statusCode, 404, 'record not found');
    });

    test(`${SERVER_PATH_PREFIX}/device.id - missing - invalid id 404`, async () => {
      let find = await context.get(`${SERVER_PATH_PREFIX}/2342`);
      assert.strictEqual(find.statusCode, 404, 'record not found');
    });

    test(`${SERVER_PATH_PREFIX}/find - found (deviceId)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: device.accessToken.toString(),
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
        deviceId: device.accessToken.toString(),
        type: first.type,
      });
      assert.strictEqual(find.body.length, 2, '2 records found');
      assert.deepEqual(find.body[0], second);
      assert.deepEqual(find.body[1], first);
    });

    test(`${SERVER_PATH_PREFIX}/find - missing (type)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: device.accessToken.toString(),
        type: 'exception',
      });
      assert.strictEqual(find.body.length, 0, '0 records found');
    });

    test(`${SERVER_PATH_PREFIX}/find - found (startTimeStamp)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: device.accessToken.toString(),
        type: first.type,
        startTimeStamp: second.timeStamp,
      });
      assert.strictEqual(find.body.length, 1, '1 record found');
      assert.deepEqual(find.body[0], second);
    });

    test(`${SERVER_PATH_PREFIX}/find - missing (startTimeStamp)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: device.accessToken.toString(),
        type: first.type,
        startTimeStamp: new Date().toISOString(),
      });
      assert.strictEqual(find.body.length, 0, 'no records found');
    });

    test(`${SERVER_PATH_PREFIX}/find - found (endTimeStamp)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: device.accessToken.toString(),
        type: first.type,
        startTimeStamp: first.timeStamp,
        endTimeStamp: first.timeStamp,
      });
      assert.strictEqual(find.body.length, 1, '1 record found');
      assert.deepEqual(find.body[0], first);
    });

    test(`${SERVER_PATH_PREFIX}/find - missing (endTimeStamp)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: device.accessToken.toString(),
        type: first.type,
        startTimeStamp: new Date().toISOString(),
        endTimeStamp: new Date(0).toISOString(),
      });
      assert.strictEqual(find.body.length, 0, 'no records found');
    });

    test(`${SERVER_PATH_PREFIX}/find - found (no limit)`, async () => {
      const find = await context.post(`${SERVER_PATH_PREFIX}/find`, {
        deviceId: device.accessToken.toString(),
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
        deviceId: device.accessToken.toString(),
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
        deviceId: device.accessToken.toString(),
        type: first.type,
        startTimeStamp: first.timeStamp,
        endTimeStamp: second.timeStamp,
        limit: 0,
      });
      assert.strictEqual(find.statusCode, 400, 'record not found');
    });
  });
});
