import assert from 'assert';
import loadConfig from '../../src/server/config';

const DEFAULT_CONFIG = require('../../config/default');

suite('config', () => {

  test('load - default config', () => {
    let config = loadConfig();
    let expected = Object.assign({}, DEFAULT_CONFIG.testing, {
      value: false
    });
    assert.deepEqual(config.testing, expected);
  });

  test('load - test config', () => {
    let config = loadConfig('test');
    let expected = Object.assign({}, DEFAULT_CONFIG.testing, {
      value: true
    });
    assert.deepEqual(config.testing, expected);
  });

  test('load - local overrides', () => {
    let config = loadConfig('test', `${__dirname}/fixtures/config`);
    let expected = Object.assign({}, DEFAULT_CONFIG.testing, {
      value: false
    });
    assert.deepEqual(config.testing, expected);
  });

});
