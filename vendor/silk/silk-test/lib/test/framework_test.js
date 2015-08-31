/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let testEnv = require('../../../framework');
let assert = require('assert');

suite('test environment', () => {
  test('battery', () => {
    assert.notEqual(testEnv, null);
    assert.notEqual(testEnv.battery, null);
  });

  test('log', () => {
    assert.notEqual(testEnv.log, null);
  });

  test('timeline', () => {
    assert.notEqual(testEnv.timeline, null);
  });

  test('opencv', () => {
    assert.notEqual(testEnv.opencv, null);
  });
});
