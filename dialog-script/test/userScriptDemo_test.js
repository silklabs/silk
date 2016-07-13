/* global suite, suiteSetup, suiteTeardown, setup, test */

import assert from 'assert';
import {UserScriptTester} from './utils';

import createLog from 'silk-log';
const log = createLog(`script-generic-test`);

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

  test(`Demo test - Unknown intent`, async (done) => {
    let text, finished;

    tester.speak(`Hello`);

    [text, finished] = await tester.listen();
    log.debug(`Reponse: ${text} ${finished}`);

    assert.equal(finished, `idle`);
    assert.equal(text, `Sorry, I'm not understanding you.`);
    done();
  });

  test(`Demo test - Test time 1 - What time is it?`, async (done) => {
    tester.speak(`What time is it`);
    await tester.listenCheck(`^The time is`, `idle`);
    done();
  });

  test(`Demo test - Test Apple stock`, async (done) => {
    tester.speak(`What's the stock price of Apple?`);
    await tester.listenCheck(`Apple`, `idle`);
    done();
  });

  test(`Demo test - Test Microsoft Stock`, async (done) => {
    tester.speak(`What is the stock price of Microsoft?`);
    await tester.listenCheck(`Microsoft`, `idle`);
    done();
  });

  test(`Demo test - Test Qualcomm stock`, async (done) => {
    tester.speak(`How's Qualcomm stock doing?`);
    await tester.listenCheck(`Qualcomm`, `idle`);
    done();
  });

  test(`Demo test - Test Google stock`, async (done) => {
    tester.speak(`How is Google stock doing?`);
    await tester.listenCheck(`Google`, `idle`);
    done();
  });

  test(`Demo test - Test Amazon Stock`, async (done) => {
    tester.speak(`How's Amazon stock doing today?`);
    await tester.listenCheck(`Amazon`, `idle`);
    done();
  });

  test(`Demo test - Test Mattel Stock`, async (done) => {
    tester.speak(`How is Mattel stock doing today?`);
    await tester.listenCheck(`Mattel`, `idle`);
    done();
  });

  test(`Demo test - Test weather 1 - clear`, async (done) => {
    tester.speak(`clear zipcode`);
    await tester.listenCheck(`Cleared zipcode`, `idle`);
    done();
  });

  test(`Demo test - Test weather 2`, async (done) => {
    tester.speak(`How's the weather today?`);
    await tester.listenCheck(`What is your zipcode?`, `waiting`);

    tester.speak(`94103`);
    await tester.listenCheck(`^It's currently`, `idle`);
    done();
  });

  test(`Demo test - Test weather 3`, async (done) => {
    tester.speak(`What's the weather like today?`);
    await tester.listenCheck(`^It's currently`, `idle`);
    done();
  });

  test(`Demo test - Test weather 4 - clear`, async (done) => {
    tester.speak(`clear zipcode`);
    await tester.listenCheck(`Cleared zipcode`, `idle`);
    done();
  });

  test(`Demo test - Test music - play`, async (done) => {
    tester.speak(`Play music`);
    await tester.listenCheck(`Playing`, `idle`);
    done();
  });

  test(`Demo test - Test music - pause`, async (done) => {
    tester.speak(`Pause music`);
    await tester.listenCheck(`Pausing`, `idle`);
    done();
  });

  test(`Demo test - Test light - turn on`, async (done) => {
    tester.speak(`Turn on lights`);
    await tester.listenCheck(`Turning on`, `idle`);
    done();
  });

  test(`Demo test - Test light - turn off`, async (done) => {
    tester.speak(`Turn off lights`);
    await tester.listenCheck(`Turning off`, `idle`);
    done();
  });
});
