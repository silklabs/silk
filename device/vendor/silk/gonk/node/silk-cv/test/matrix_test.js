'use strict';

const assert = require('assert');
const silkcv = require('..');

suite('Matrix', () => {
  test('erodeWithBlackBorder', () => {
    assert(typeof silkcv.Matrix.erodeWithBlackBorder === 'function');
  });
});
