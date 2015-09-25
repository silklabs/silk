import assert from 'assert';
import { spawn } from 'child_process';
import fs from 'mz/fs';
import path from 'path';
import eventToPromise from 'event-to-promise';
import split from 'split';

import Logcat from '../../lib/streams/logcat';

suite('logcat', () => {
  let subject;
  setup(() => {
    subject = new Logcat();
  });

  /**
   * These tests rely on human validation to create and exist mostly as a
   * regression suite.
   */

  async function createFixture(name) { //eslint-disable-line no-unused-vars
    let logcat = new Logcat();
    let textFile = path.join(__dirname, `logcat/${name}.txt`);
    let jsonFile = path.join(__dirname, `logcat/${name}.json`);

    let result = [];
    let stream = fs.createReadStream(textFile);
    stream.pipe(split()).pipe(logcat);
    logcat.on('data', (json) => {
      result.push(json);
    });
    await eventToPromise(logcat, 'finish');
    console.log(result);
    await fs.writeFile(jsonFile, JSON.stringify(result, null, 2));
  }

  function testFixture(name) {
    test(`fixture: ${name}`, async () => {
      let logcat = new Logcat();
      let textFile = path.join(__dirname, `logcat/${name}.txt`);
      let jsonFile = path.join(__dirname, `logcat/${name}.json`);

      let expected = JSON.parse(await fs.readFile(jsonFile));

      let result = [];
      let stream = fs.createReadStream(textFile);
      stream.pipe(split()).pipe(logcat);
      logcat.on('data', (log) => {
        // convert log to json format for compare...
        result.push(log);
      });
      await eventToPromise(logcat, 'finish');
      assert.deepEqual(result, expected);
    });
  }

  setup(async () => {
    /**
     * A human must uncomment and commit the results of these fixture
     * generations to disk!
     */
    //await createFixture('threadtime');
  });

  testFixture('threadtime');

  test('with real device hooked up', async () => {
    if (process.env.WITH_DEVICE !== 'true') {
      return;
    }
    let stream = spawn('adb', ['logcat', '-v', 'threadtime']);
    stream.stdout.pipe(split()).pipe(subject);
    subject.on('data', (d) => {
      console.log(d);
    });
    await eventToPromise(subject, 'finish');
  });
});
