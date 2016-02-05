import assert from 'assert';
import path from 'path';

import * as fixture from './fixture';
import config from '../src/config';

suite('config', () => {
  let cwd, fixtureDir;
  suiteSetup(async () => {
    // Ensure we don't keep around global SILKRC from elsewhere...
    delete process.env.SILKRC;

    cwd = process.cwd();
    fixtureDir = await fixture.create();
  });

  suiteTeardown(async() => {
    await fixture.destroy(fixtureDir);
  });

  // Always revert to initial cwd
  teardown(async () => {
    delete process.env.SILKRC;
    process.chdir(cwd);
  });

  test('project only resolve', () => {
    let fixture = path.join(fixtureDir, 'project_1');
    process.chdir(fixture);
    let result = config();
    let expected = [
      path.resolve(fixture, 'node_modules/silk-plugin-a/index.js'),
      path.resolve(fixture, 'node_modules/b/index.js'),
      path.resolve(__dirname, '../src/cmd/init.js'),
    ];
    assert.deepEqual(result.plugins.sort(), expected.sort());

    // Inside of an inner directory...
    process.chdir(path.join(fixture, 'nested/dir'));
    let innerDirResult = config();
    assert.deepEqual(innerDirResult.plugins.sort(), expected.sort());
  });

  test('global only resolve', () => {
    let fixture = path.join(fixtureDir, 'project_empty');
    process.chdir(fixture);
    let result = config(fixtureDir, path.join(fixtureDir, 'global'));
    let expected = [
      path.join(fixtureDir, 'global/node_modules/silk-plugin-internal/index.js'),
      path.resolve(__dirname, '../src/cmd/init.js'),
    ];
    assert.deepEqual(result.plugins, expected);
  });

  test('project + global resolve', () => {
    let fixture = path.join(fixtureDir, 'project_1');
    process.chdir(fixture);
    let result = config(process.cwd(), path.join(fixtureDir, 'global'));
    let expected = [
      path.join(fixtureDir, 'global/node_modules/silk-plugin-internal/index.js'),
      path.resolve(fixture, 'node_modules/silk-plugin-a/index.js'),
      path.resolve(fixture, 'node_modules/b/index.js'),
      path.resolve(__dirname, '../src/cmd/init.js'),
    ];
    assert.deepEqual(result.plugins.sort(), expected.sort());
  });

  test('Use explicit .silkrc via environment variable', () => {
    let fixture = path.join(fixtureDir, 'global');
    process.env.SILKRC = path.join(fixture, '.silkrc');
    let result = config();
    let expected = [
      path.join(fixtureDir, 'global/node_modules/silk-plugin-internal/index.js'),
      path.resolve(__dirname, '../src/cmd/init.js'),
    ];
    assert.deepEqual(result.plugins, expected);
  });

});
