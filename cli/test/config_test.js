import assert from 'assert';
import path from 'path';

import config from '../src/config';

suite('config', () => {

  let cwd;
  suiteSetup(() => {
    cwd = process.cwd();
  });

  // Always revert to initial cwd
  teardown(() => {
    process.chdir(cwd);
  });

  test('project only resolve', () => {
    let fixture = path.join(__dirname, 'fixtures/project_1');
    process.chdir(fixture);
    let result = config();
    let expected = [
      path.resolve(fixture, 'node_modules/silk-plugin-a/index.js'),
      path.resolve(fixture, 'node_modules/b/index.js'),
    ];

    assert.deepEqual(result.plugins.sort(), expected.sort());
  });

});
