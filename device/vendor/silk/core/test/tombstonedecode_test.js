import assert from 'assert';
import mkdirp from 'mkdirp-promise';
import fs from 'mz/fs';
import { exec } from 'mz/child_process';
import path from 'path';
import { CrashReporter } from '../lib/crash_reporter';
import { buildJSTombstone } from '../lib/js_errors.js';

const TOMBSTONE_PATH = path.join(__dirname, 'tombstones');

const FIXTURES = path.join(__dirname, '.crash_reporter');

suite(__filename, () => {
  let cleanup = async () => {
    await exec(`rm -rf ${FIXTURES}`);
  };

  setup(cleanup);
  teardown(cleanup);

  // Ensure that a simulated JS tombstone can be successfully parsed by
  // CrashReporter._tombstoneToRaygunError
  test('bareJSTombstone', async () => {
    await mkdirp(FIXTURES);
    const jsTombstone = path.join(FIXTURES, 'tombstone_js');
    let rstream = await buildJSTombstone('bogusException', new Error('I am a test'));
    let wstream = fs.createWriteStream(jsTombstone);
    rstream.pipe(wstream);
    const raygunError = await CrashReporter._tombstoneToRaygunError(jsTombstone);

    assert.equal(raygunError.message, 'Error: I am a test');
    assert.equal(raygunError.className, 'Type: \\\'bogusException\\\'');
  });

  // Ensure that CrashReporter._tombstoneToRaygunError processes some canned
  // tombstones as expected
  test('_tombstoneToRaygunError', async () => {
    const files = await fs.readdir(TOMBSTONE_PATH);

    for (const file of files) {
      if (file.match(/^tombstone_\d\d$/)) {
        const tombstone = path.join(TOMBSTONE_PATH, file);
        console.log('Processing', tombstone); // eslint-disable-line no-console

        const raygunError = await CrashReporter._tombstoneToRaygunError(tombstone);
        const actual = JSON.stringify(raygunError, null, ' ');
        await fs.writeFile(tombstone + '.actual', actual); // Save actual for easy inspection on fail

        const expected = await fs.readFile(tombstone + '.expected', {encoding:'utf8'});
        assert.deepEqual(expected, actual);
      }
    }
  });
});
