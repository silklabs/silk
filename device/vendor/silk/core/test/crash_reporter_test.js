import assert from 'assert';
import mkdirp from 'mkdirp-promise';
import net from 'net';
import fs from 'mz/fs';
import path from 'path';
import createApi from './api';
import createDeviceId from './device_id';
import randomStream from './random_stream';
import { exec } from 'mz/child_process';
import eventToPromise from 'event-to-promise';
import createOutbox from '../lib/outbox/manager';

import CrashReportOp from '../lib/outbox/crash_report_operation';

import {
  Tombstones,
  default as createCrashReporter
} from '../lib/crash_reporter';

const FIXTURES = path.join(__dirname, '.crash_reporter');

suite('crash report', () => {

  let cleanup = async () => {
    await exec(`rm -rf ${FIXTURES}`);
  };

  function tombstonePath(value) {
    return path.join(FIXTURES, 'tombstones', value);
  }

  setup(cleanup);
  teardown(cleanup);

  suite('Tombstones', () => {
    let subject;
    setup(() => {
      subject = new Tombstones(path.join(FIXTURES, 'tombstones'));
    });

    test('.scan - no files', async () => {
      let files = await subject.scan();
      assert.equal(files.length, 0);
    });

    test('.scan - many files including some junk', async () => {
      await mkdirp(tombstonePath(''));
      await Promise.all([
        fs.writeFile(tombstonePath('tombstone_1')),
        fs.writeFile(tombstonePath('tombstone_39')),
        fs.writeFile(tombstonePath('tombstone_2')),
        fs.writeFile(tombstonePath('junk')),
        fs.writeFile(tombstonePath('junk')),
      ]);

      assert.deepEqual(await subject.scan(), [
        tombstonePath('tombstone_1'),
        tombstonePath('tombstone_2'),
        tombstonePath('tombstone_39')
      ]);
    });

    test('.findFreeTombstoneId - no tombstones', async () => {
      let tombstone = await subject.findFreeTombstoneId();
      assert.equal(tombstone, tombstonePath('tombstone_20'));
    });

    test('.findFreeTombstoneId - full tombstones', async () => {
      // write this one first so it's the oldest...
      await mkdirp(tombstonePath(''));
      await fs.writeFile(tombstonePath('tombstone_20'));

      // write the test of them out ...
      let ops = [];
      for (let i = 21; i < 40; i++) {
        ops.push(fs.writeFile(tombstonePath(`tombstone_${i}`)));
      }
      await ops;

      let tombstone = await subject.findFreeTombstoneId();
      assert.equal(tombstone, tombstonePath('tombstone_20'));
    });

    test('.update', async () => {
      // write this one first so it's the oldest...
      await mkdirp(tombstonePath(''));
      await fs.writeFile(tombstonePath('tombstone_1'));
      await fs.writeFile(tombstonePath('tombstone_4'));
      await subject.update();

      assert.deepEqual(subject.fileQueue, [
        tombstonePath('tombstone_1'),
        tombstonePath('tombstone_4')
      ]);
    });

    test('.report - concurrent usage', async () => {
      let ops = [];
      let expectedQueue = [];
      let expected = {};

      for (let i = 20; i < 40; i++) {
        let bytes = randomStream(30);
        let tombstone = tombstonePath(`tombstone_${i}`);
        expected[tombstone] = bytes.buffer;
        expectedQueue.push(tombstone);
        ops.push(subject.report(bytes.stream));
      }
      await Promise.all(ops);

      for (let tombstone in expected) {
        let expectedTombstone = expected[tombstone];
        assert.ok(await fs.exists(tombstone), `${tombstone} must exist.`);
        let actualTombstone = await fs.readFile(tombstone, 'utf8');
        assert.equal(expectedTombstone.toString(), actualTombstone, tombstone);
      }

      assert.deepEqual(subject.fileQueue, expectedQueue);
    });
  });

  suite('crash reporter', () => {
    let outboxPath = path.join(FIXTURES, 'outbox');
    let debuggerdSocketPath = path.join(FIXTURES, 'debuggerd_socket');
    let tombstonesDir = path.join(FIXTURES, 'tombstones');

    // Ensure fixture directory exists...
    setup(async () => {
      await mkdirp(FIXTURES);
    });

    function create(enabled = true) {
      let outbox = createOutbox({
        storagePath: outboxPath
      });
      // Run the operations but do not actually hit the server...
      outbox.online = false;
      outbox.registerOperation(CrashReportOp);

      let crash = createCrashReporter(outbox, {
        crashReporterEnabled: enabled,
        debuggerdSocketPath,
        tombstonePath: tombstonesDir
      });

      return { crash, outbox };
    }

    async function debuggerdTrigger(stream) {
      let socket = net.connect(debuggerdSocketPath);
      await eventToPromise(socket, 'connect');
      stream.pipe(socket);
      await eventToPromise(socket, 'close');
    }

    test('manually report crash before deviceId', async () => {
      let { crash, outbox} = create();
      let { stream, buffer } = randomStream();
      await crash.report(stream);

      // Test both that shutdown works and use it as a mechanism to ensure we
      // have written everything to disk...
      await crash.shutdown();
      await outbox.shutdown();

      let expectedEntry = path.join(outboxPath, 'default-queue/1/');
      assert.ok(await fs.exists(expectedEntry, 'has outbox entry'));

      let content = await fs.readFile(path.join(expectedEntry, 'blob'), 'utf8');
      assert.equal(content, buffer.toString());
    });

    test('crash before deviceId', async () => {
      let { crash, outbox} = create();
      let { stream, buffer } = randomStream();

      // Simulate the debuggerd case...
      await mkdirp(tombstonesDir);
      await fs.writeFile(tombstonePath('tombstone_1'), buffer);
      await debuggerdTrigger(stream);

      // debuggerdTrigger() guarantees that the signal was sent to the crash
      // report but not that the tombstone has been fully processed.  Block
      // until the tombstone_1 file is removed implying that it has been
      // successfully queued in the outbox.
      await new Promise(resolve => {
        let tick = setInterval(() => {
          fs.stat(tombstonePath('tombstone_1'))
          .catch(() => {
            clearInterval(tick);
            resolve();
          });
        }, 500);
      });

      // Test both that shutdown works and use it as a mechanism to ensure we
      // have written everything to disk...
      await crash.shutdown();
      await outbox.shutdown();

      let expectedEntry = path.join(outboxPath, 'default-queue/1/');
      assert.ok(await fs.exists(expectedEntry, 'has outbox entry'));

      let content = await fs.readFile(path.join(expectedEntry, 'blob'), 'utf8');
      assert.equal(content, buffer.toString());
    });

    test('pre existing with device id', async () => {
      let deviceId = createDeviceId();
      let { crash, outbox} = create();
      let { buffer } = randomStream();

      // Simulate an existing tombstone...
      await mkdirp(tombstonesDir);
      await fs.writeFile(tombstonePath('tombstone_1'), buffer);
      // It is expected that normally people will not wait for the promise but
      // it is useful for this test...
      await crash.assignDeviceId(deviceId);

      // Test both that shutdown works and use it as a mechanism to ensure we
      // have written everything to disk...
      await crash.shutdown();
      await outbox.shutdown();

      let expectedEntry = path.join(outboxPath, 'default-queue/1/');
      assert.ok(await fs.exists(expectedEntry, 'has outbox entry'));

      let content = await fs.readFile(path.join(expectedEntry, 'blob'), 'utf8');
      assert.equal(content, buffer.toString());
    });

    test('upload to server', async () => {

      if (require('./skip-on-travis.js')()) return;

      let deviceId = createDeviceId();
      let { crash, outbox} = create();
      let { stream } = randomStream();

      let { device: api } = await createApi();

      outbox.online = true;
      await crash.assignDeviceId(deviceId);
      await crash.report(stream);

      // Test both that shutdown works and use it as a mechanism to ensure we
      // have written everything to disk...
      await crash.shutdown();
      await outbox.shutdown();

      // See if we can find it on the server...
      let result = await api.crashMeta.find({
        deviceId: api.accessToken.toString(),
        type: 'tombstone',
        limit: 1
      });

      assert.equal(result.length, 1);
      assert.equal(result[0].deviceId, api.accessToken.toString());
    });
  });
});
