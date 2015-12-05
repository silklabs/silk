import assert from 'assert';
import createContext from '../context';

suite('crash metadata apis', () => {
  const context = createContext();
  let device;
  let crashApi;
  setup(async function() {
    device = await context.testDevice();
    context.api.accessToken = device.accessToken;

    let account = await context.testAccount();
    crashApi = account.api.crash;
  });

  suite(`crash api`, () => {
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

    test(` POST - no type`, async () => {
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

    test(`/device.id - found`, async () => {
      const find = await crashApi.findById(first.id);
      assert.deepEqual(find, first);
    });

    test(`/device.id - found`, async () => {
      const find = await crashApi.findById(second.id);
      assert.deepEqual(find, second);
    });

    test(`/device.id - missing - valid id but 404`, async () => {
      await context.assertThrows(async () => {
        await crashApi.findById(`aaaaaaaaaaaa`);
      }, /Not Found/);
    });

    test(`/device.id - missing - empty id 404`, async () => {
      await context.assertThrows(async () => {
        await crashApi.findById(``);
      }, /Not Found/);
    });

    test(`/device.id - missing - invalid id 404`, async () => {
      await context.assertThrows(async () => {
        await crashApi.findById(`2342`);
      }, /Not Found/);
    });

    test(`/find - found (deviceId)`, async () => {
      const find = await crashApi.findAll({
        deviceId: device.accessToken.toString(),
      });
      assert.strictEqual(find.length, 2, '2 records found');
      assert.deepEqual(find[0], second);
      assert.deepEqual(find[1], first);
    });

    test(`/find - missing (deviceId)`, async () => {
      const find = await crashApi.findAll({
        deviceId: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01',
      });
      assert.strictEqual(find.length, 0, '0 records found');
    });

    test(`/find - found (type)`, async () => {
      const find = await crashApi.findAll({
        deviceId: device.accessToken.toString(),
        type: first.type,
      });
      assert.strictEqual(find.length, 2, '2 records found');
      assert.deepEqual(find[0], second);
      assert.deepEqual(find[1], first);
    });

    test(`/find - missing (type)`, async () => {
      const find = await crashApi.findAll({
        deviceId: device.accessToken.toString(),
        type: 'exception',
      });
      assert.strictEqual(find.length, 0, '0 records found');
    });

    test(`/find - found (startTimeStamp)`, async () => {
      const find = await crashApi.findAll({
        deviceId: device.accessToken.toString(),
        type: first.type,
        startTimeStamp: second.timeStamp,
      });
      assert.strictEqual(find.length, 1, '1 record found');
      assert.deepEqual(find[0], second);
    });

    test(`/find - missing (startTimeStamp)`, async () => {
      const find = await crashApi.findAll({
        deviceId: device.accessToken.toString(),
        type: first.type,
        startTimeStamp: new Date().toISOString(),
      });
      assert.strictEqual(find.length, 0, 'no records found');
    });

    test(`/find - found (endTimeStamp)`, async () => {
      const find = await crashApi.findAll({
        deviceId: device.accessToken.toString(),
        type: first.type,
        startTimeStamp: first.timeStamp,
        endTimeStamp: first.timeStamp,
      });
      assert.strictEqual(find.length, 1, '1 record found');
      assert.deepEqual(find[0], first);
    });

    test(`/find - missing (endTimeStamp)`, async () => {
      const find = await crashApi.findAll({
        deviceId: device.accessToken.toString(),
        type: first.type,
        startTimeStamp: new Date().toISOString(),
        endTimeStamp: new Date(0).toISOString(),
      });
      assert.strictEqual(find.length, 0, 'no records found');
    });

    test(`/find - found (no limit)`, async () => {
      const find = await crashApi.findAll({
        deviceId: device.accessToken.toString(),
        type: first.type,
        startTimeStamp: first.timeStamp,
        endTimeStamp: second.timeStamp,
      });
      assert.strictEqual(find.length, 2, '2 records found');
      assert.deepEqual(find[0], second);
      assert.deepEqual(find[1], first);
    });

    test(`/find - found (limit)`, async () => {
      const find = await crashApi.findAll({
        deviceId: device.accessToken.toString(),
        type: first.type,
        startTimeStamp: first.timeStamp,
        endTimeStamp: second.timeStamp,
        limit: 1
      });
      assert.strictEqual(find.length, 1, '1 record found');
      assert.deepEqual(find[0], second);
    });

    test(`/find - (0 limit) 400`, async () => {
      await context.assertThrows(async () => {
        await crashApi.findAll({
          deviceId: device.accessToken.toString(),
          type: first.type,
          startTimeStamp: first.timeStamp,
          endTimeStamp: second.timeStamp,
          limit: 0,
        });
      }, /InputError/);
    });
  });
});
