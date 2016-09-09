/**
 * @flow
 */

import assert from 'assert';
import {UserScriptTester} from './utils';

//import createLog from 'silk-log';
//const log = createLog(`script-timers-test`);

suite(`userScript`, () => {

  if (process.env.CI === `true`) {
    console.warn(`Skipping userScript tests while running on CI`); // eslint-disable-line no-console
    return;
  }

  let tester = new UserScriptTester();

  // Luis is rate limits at 5QPS.
  // Run tests sequentially and wait a little between runs.
  suiteSetup(() => tester.suiteSetup());
  suiteTeardown(() => tester.suiteTeardown());
  setup(done => {
    setTimeout(() => {
      tester.setup();
      done && done();
    }, 500);
  });

  test(`Timer test - start 5 second timer`, async (done) => {
    tester.speak(`Start a timer for 5 seconds`);
    await tester.listenCheck(`^Ok, I've started a timer`, `idle`);

    let timer = setTimeout(() => assert(false, 'Timer did not expire'), 7000);

    await tester.listenCheck(`^Timer 0 has expired`, `idle`);
    clearTimeout(timer);
    done && done();
  });

  test(`Timer test - start 10 second timer`, async (done) => {
    tester.speak(`Start a timer for 10 seconds`);
    await tester.listenCheck(`^Ok, I've started a timer`, `idle`);

    let timer = setTimeout(() => assert(false, 'Timer did not expire'), 11000);

    await tester.listenCheck(`^Timer 1 has expired`, `idle`);
    clearTimeout(timer);
    done && done();
  });

  test(`Timer test - start/cancel 1 day`, async (done) => {
    tester.speak(`Start a timer for 1 day`);
    await tester.listenCheck(`^Ok, I've started a timer`, `idle`);
    tester.speak(`Cancel the timer for 1 day`);
    await tester.listenCheck(`^Ok, I've canceled that timer`, `idle`);
    done && done();
  });

});
