/**
 * @flow
 */

import assert from 'assert';
import * as fs from 'mz/fs';

import {
  decode,
  encode,
  ensureDirectory,
  load,
  save,
} from '../../lib/store/storage';

const invariant = assert;

const TEST_DIR_PATH = 'tmp/';
const TEST_FILE_PATH = TEST_DIR_PATH + 'store.mpk';

const testArray = [1, 2, 3];
const testDate = new Date();
const testError = new Error('foo');
const testArrayBuffer = new ArrayBuffer(10);
const testDataView = new DataView(testArrayBuffer);

const testObj = {
  obj: {
    a: 'a',
    b: 1,
  },
  array: testArray,
  set: new Set(testArray),
  map: new Map([['a', 1], ['b', 2]]),
  buffer: new Buffer('abc'),
  date: testDate,
  regexp: /^.+$/,
  error: testError,
  int8Array: new Int8Array(testArray),
  uint8Array: new Uint8Array(testArray),
  int16Array: new Int16Array(testArray),
  uint16Array: new Uint16Array(testArray),
  int32Array: new Int32Array(testArray),
  uint32Array: new Uint32Array(testArray),
  float32Array: new Float32Array(testArray),
  float64Array: new Float64Array(testArray),
  uint8ClampedArray: new Uint8ClampedArray(testArray),
  arrayBuffer: testArrayBuffer,
  dataView: testDataView,
  string: 'foo',
  number: 10,
  boolean: false,
  null: null,
  void: undefined,
};

function assertEqualTestObj(obj: Object) {
  // undefined gets upgraded to null... Meh.
  assert.strictEqual(obj.void, null);
  obj.void = undefined;

  // Error objects don't compare equal.
  invariant(obj.error);
  invariant(obj.error instanceof Error);
  assert.strictEqual(obj.error.message, testObj.error.message);
  assert.strictEqual(obj.error.stack, testObj.error.stack);
  obj.error = testObj.error;

  assert.deepEqual(obj, testObj);
}

suite('storage', () => {

  async function cleanup() {
    try {
      await fs.unlink(TEST_FILE_PATH);
    } catch (error) {
      // ignore
    }

    try {
      await fs.rmdir(TEST_DIR_PATH);
    } catch (error) {
      // ignore
    }
  }

  setup(cleanup);
  suiteTeardown(cleanup);

  test('encode/decode', async () => {
    const buffer = encode(testObj);
    assert(buffer);

    const decoded = decode(buffer);
    assertEqualTestObj(decoded);
  });

  test('ensureDirectory', async () => {
    let error: Error;
    try {
      await fs.stat(TEST_DIR_PATH);
    } catch (err) {
      error = err;
    }

    invariant(error);
    invariant(error.code);
    assert.equal(error.code, 'ENOENT');

    await ensureDirectory(TEST_DIR_PATH);
    let stats = await fs.stat(TEST_DIR_PATH);

    assert.equal(stats.isDirectory(), true);

    await ensureDirectory(TEST_DIR_PATH);
    stats = await fs.stat(TEST_DIR_PATH);

    assert.equal(stats.isDirectory(), true);
  });

  test('load', async () => {
    const loaded = await load(TEST_FILE_PATH);
    assert.strictEqual(loaded, null);
  });

  test('save/load', async () => {
    await ensureDirectory(TEST_DIR_PATH);

    let error: Error;
    try {
      await fs.stat(TEST_FILE_PATH);
    } catch (err) {
      error = err;
    }

    invariant(error);
    invariant(error.code);
    assert.equal(error.code, 'ENOENT');

    await save({foo: 10}, TEST_FILE_PATH);
    let stats = await fs.stat(TEST_FILE_PATH);
    assert.equal(stats.isFile(), true);

    await save(testObj, TEST_FILE_PATH);

    const loaded = await load(TEST_FILE_PATH);
    invariant(loaded);
    assertEqualTestObj(loaded);
  });
});
