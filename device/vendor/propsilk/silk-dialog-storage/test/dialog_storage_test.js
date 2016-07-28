/**
 * @noflow
 */

/* global suite, setup, suiteTeardown, test */

import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';

import {DialogStorage} from '../';

const testRootDir = path.join(__dirname, `tmp`);
const testDir = path.join(testRootDir, `/foo/bar/baz`);

async function testSteps(storage, steps) {
  const promises = steps.map((step) => {
    if (`set` in step) {
      return storage.set(step.set);
    }
    return storage.get();
  });
  const results = await Promise.all(promises);
  steps.forEach((step, index) => {
    if (`get` in step) {
      if (step.get === undefined) {
        assert.strictEqual(results[index], step.get);
      } else {
        assert.deepEqual(results[index], step.get);
      }
    }
  });
}

suite(`dialog_storage`, () => {

  let storage = null;

  suiteTeardown(() => {
    fs.removeSync(testRootDir);
  });

  setup(() => {
    fs.removeSync(testRootDir);
    storage = new DialogStorage({path: testDir});
  });

  test(`Get empty`, () => {
    return testSteps(storage, [
      {get: undefined},
    ]);
  });

  test(`Set`, () => {
    const data = {foo: 10, bar: [100, 200], baz: `Hi`};
    return testSteps(storage, [
      {get: undefined},
      {set: data},
      {get: data},
    ]);
  });

  test(`Set empty`, () => {
    const data = {foo: []};
    return testSteps(storage, [
      {get: undefined},
      {set: data},
      {get: data},
      {set: undefined},
      {get: undefined},
    ]);
  });

  test(`Ridiculous`, () => {
    const steps = [{get: undefined}];

    const data = `abcdefghijklmnopqrstuvwxys0123456789`;
    const setStepNoData = {set: undefined};
    const getStepNoData = {get: undefined};

    let i = 0;
    for (; i < 100; i++) {
      steps.push({set: {data, i}});
    }
    for (; i < 300; i++) {
      const obj = {data, i};
      steps.push({set: obj});
      steps.push({get: obj});
    }
    steps.push(setStepNoData);
    for (let i = 0; i < 100; i++) {
      steps.push(getStepNoData);
    }
    return testSteps(storage, steps);
  });

});
