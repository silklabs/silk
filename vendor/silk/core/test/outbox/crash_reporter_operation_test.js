import assert from 'assert';
import api from '../api';
import randomStream from '../random_stream';
import { exec } from 'mz/child_process';
import path from 'path';
import fs from 'mz/fs';
import mkdirp from 'mkdirp-promise';
import fetch from 'node-fetch';
import mkLog from '../../lib/log'; const log = mkLog('ut');

import CrashReporterOperation from '../../lib/outbox/crash_report_operation';

const FIXTURE_DIR = path.join(__dirname, '/crash_reports');

suite('CrashReporterOperation', () => {

  async function cleanup() {
    await exec(`rm -rf ${FIXTURE_DIR}`);
    await mkdirp(FIXTURE_DIR);
  }
  setup(cleanup);
  teardown(cleanup);

  let id;
  setup(() => {
    id = api.id.create();
    log.info('id', id);
  });

  test('Upload crash report...', async () => {
    if (require('../skip-on-travis.js')()) return;

    let { stream, buffer } = randomStream();
    let tombstone = path.join(FIXTURE_DIR, 'one');
    await fs.writeFile(tombstone, buffer);
    let stat = await fs.stat(tombstone);

    let operation = new CrashReporterOperation({
      size: stat.size,
      metadata: {
        deviceId: id.toString(),
        timeStamp: stat.birthtime,
        type: 'tombstone'
      }
    });

    log.info('Uploading crash report');
    await operation.write(tombstone);

    log.info('See if we can find it on the server...');
    let result = await api.crashMeta.find({
      deviceId: id.toString(),
      type: 'tombstone',
      limit: 1
    });
    log.info('Found:', result);

    assert.equal(result.length, 1);

    log.info('Fetching', result[0].url);
    let res = await fetch(result[0].url)
    let text = await res.text();
    assert.equal(text, buffer.toString());
  });

});
