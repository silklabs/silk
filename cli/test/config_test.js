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
    delete process.env.SILKRC;
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

    // Inside of an inner directory...
    process.chdir(path.join(fixture, 'nested/dir'));
    let innerDirResult = config();
    assert.deepEqual(innerDirResult.plugins.sort(), expected.sort());
  });

  test('global only resolve', () => {
    let fixture = path.join(__dirname, 'fixtures/project_empty');
    process.chdir(fixture);
    let result = config(process.cwd(), path.join(__dirname, 'fixtures/global'));
    let expected = [
      path.join(__dirname, 'fixtures/global/node_modules/silk-plugin-internal/index.js')
    ];
    assert.deepEqual(result.plugins, expected);
  });

  test('project + global resolve', () => {
    let fixture = path.join(__dirname, 'fixtures/project_1');
    process.chdir(fixture);
    let result = config(process.cwd(), path.join(__dirname, 'fixtures/global'));
    let expected = [
      path.join(__dirname, 'fixtures/global/node_modules/silk-plugin-internal/index.js'),
      path.resolve(fixture, 'node_modules/silk-plugin-a/index.js'),
      path.resolve(fixture, 'node_modules/b/index.js'),
    ];
    assert.deepEqual(result.plugins.sort(), expected.sort());
  });

  test('Use explicit .silkrc via environment variable', () => {
    let fixture = path.join(__dirname, 'fixtures/global');
    process.env.SILKRC = path.join(fixture, '.silkrc');
    let result = config();
    let expected = [
      path.join(__dirname, 'fixtures/global/node_modules/silk-plugin-internal/index.js')
    ];
    assert.deepEqual(result.plugins, expected);
  });

});
