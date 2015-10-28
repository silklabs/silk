/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import { exec } from 'mz/child_process';
import path from 'path';
import fs from 'mz/fs';
import assert from 'assert';
import mkdirp from 'mkdirp-promise';
import Queue from '../../lib/outbox/queue';

const FIXTURE_DIR = path.join(__dirname, '/outbox_fixture');

suite('Queue', () => {
  async function cleanup() {
    await exec(`rm -rf ${FIXTURE_DIR}`);
  }

  setup(cleanup);
  teardown(cleanup);

  test('.searchDirectory', async () => {
    let storagePath = path.join(FIXTURE_DIR, 'queue');
    await mkdirp(storagePath);

    await Promise.all([
      // Create some valid directories...
      mkdirp(path.join(storagePath, '1')),
      mkdirp(path.join(storagePath, '2')),
      mkdirp(path.join(storagePath, '1000')),

      // Some things which look like directories
      fs.writeFile(path.join(storagePath, '1001'), ''),
      fs.writeFile(path.join(storagePath, '3'), ''),

      // Not number junk wtf is this stuff
      fs.writeFile(path.join(storagePath, '.imessyouup')),
      mkdirp(path.join(storagePath, '.imessyouupdir')),
    ]);

    let result = await Queue.searchDirectory(storagePath);
    assert.deepEqual(result, [1, 2, 1000]);
  });

});

