/**
 * @noflow
 */

import assert from 'assert';
import { execSync } from 'child_process';
import path from 'path';

import extract from '..';

const FIXTURE = path.join(__dirname, 'fixtures');
const OUT = path.join(__dirname, 'output');

suite('extract', function() {

  function clean() {
    execSync(`rm -rf ${OUT}`);
  }

  setup(clean);
  teardown(clean);

  test('multiple modules /w same name', async () => {
    const expected = {
      a: require(path.join(FIXTURE, 'node_modules/a')),
      b: require(path.join(FIXTURE, 'node_modules/b')),
    };

    await extract(FIXTURE, ['a', 'b'], OUT);

    const actual = {
      a: require(path.join(OUT, 'a')),
      b: require(path.join(OUT, 'b')),
    };

    assert.deepEqual(expected, actual);
  });

});
