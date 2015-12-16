import assert from 'assert';
import fs from 'mz/fs';
import path from 'path';
import { CrashReporter } from '../lib/crash_reporter';

const TOMBSTONE_PATH = path.join(__dirname, 'tombstones');

suite(__filename, () => {
  test('_tombstoneToRaygunError', async () => {
    const files = await fs.readdir(TOMBSTONE_PATH);

    for (const file of files) {
      if (file.match(/^tombstone_\d\d$/)) {
        const tombstone = path.join(TOMBSTONE_PATH, file);
        console.log('Processing', tombstone);

        const raygunError = await CrashReporter._tombstoneToRaygunError(tombstone);
        const actual = JSON.stringify(raygunError, null, ' ');
        await fs.writeFile(tombstone + '.actual', actual); // Save actual for easy inspection on fail

        const expected = await fs.readFile(tombstone + '.expected', {encoding:'utf8'});
        assert.deepEqual(expected, actual);
      }
    }
  });
});
