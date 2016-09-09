/* global suite, suiteSetup, suiteTeardown, setup, test */

import {UserScriptTester} from './utils';

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
      done();
    }, 500);
  });

  test(`Keyword test`, async (done) => {
    tester.speak(`Record keyword Aristotle 2 times`);
    await tester.listenCheck(`^Start speaking the keyword`, `waiting`);
    for (let count = 0; count < 2; count++) {
      tester.speak(`Aristotle`);
      if (count < (2 - 1)) {
        await tester.listenCheck(`^Count ${count + 1} of 2`, `waiting`);
      } else {
        await tester.listenCheck(`^Count ${count + 1}`, `idle`);
      }
    }
    done();
  });

  test(`Keyword test count spelled out`, async (done) => {
    tester.speak(`Record keyword Aristotle two times`);
    await tester.listenCheck(`^Start speaking the keyword`, `waiting`);
    for (let count = 0; count < 2; count++) {
      tester.speak(`Aristotle`);
      if (count < (2 - 1)) {
        await tester.listenCheck(`^Count ${count + 1} of 2`, `waiting`);
      } else {
        await tester.listenCheck(`^Count ${count + 1}`, `idle`);
      }
    }
    done();
  });

  test(`Keyword test invalid count`, async (done) => {
    tester.speak(`Record keyword Aristotle`);
    await tester.listenCheck(`^Invalid count provided`);
    await tester.listenCheck(`^Start speaking the keyword`, `waiting`);
    tester.speak(`cancel`);
    await tester.listenCheck(`^Canceled recording keywords`, `idle`);
    done();
  });

});
