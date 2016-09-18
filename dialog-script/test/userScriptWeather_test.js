/**
 * @flow
 */

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
      done && done();
    }, 500);
  });

  test(`Demo test - Test weather with zipcode`, async (done) => {
    tester.speak(`How's the weather in 92131?`);
    await tester.listenCheck(`^It's currently`, `idle`);
    done && done();
  });

  test(`Demo test - Test weather with city name`, async (done) => {
    tester.speak(`How's the weather in San Diego?`);
    await tester.listenCheck(`^It's currently.*San Diego$`, `idle`);
    done && done();
  });

  test(`Demo test - Test weather with stored city name`, async (done) => {
    tester.speak(`How's the weather today?`);
    await tester.listenCheck(`^It's currently.*San Diego$`, `idle`);
    done && done();
  });

  test(`Demo test - Test weather 1 - clear`, async (done) => {
    tester.speak(`clear zipcode`);
    await tester.listenCheck(`Cleared location`, `idle`);
    done && done();
  });

  test(`Demo test - Test weather 2`, async (done) => {
    tester.speak(`How's the weather today?`);
    await tester.listenCheck(`What is your city or zipcode?`, `waiting`);

    tester.speak(`94103`);
    await tester.listenCheck(`^It's currently`, `idle`);
    done && done();
  });

  test(`Demo test - Test weather 3`, async (done) => {
    tester.speak(`What's the weather like today?`);
    await tester.listenCheck(`^It's currently`, `idle`);
    done && done();
  });

  test(`Demo test - Test weather 4 - clear`, async (done) => {
    tester.speak(`clear zipcode`);
    await tester.listenCheck(`Cleared location`, `idle`);
    done && done();
  });

  test(`Demo test - Test weather with zipcode spelled out`, async (done) => {
    tester.speak(`How's the weather in nine two one three one?`);
    await tester.listenCheck(`^It's currently`, `idle`);
    done && done();
  });
});
