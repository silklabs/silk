/* global suite, suiteSetup, suiteTeardown, setup, test */

import assert from 'assert';
import {UserScriptTester} from './utils';
import moment from 'moment';

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

  // "time": "T07", "date": "YYYY-MM-DD"
  test(`Alarm test - start an alarm for next day at 7am`, async (done) => {
    tester.speak(`Set an alarm for tomorrow at 7 am`);
    await tester.listenCheck(`^Ok, I've started an alarm`, `idle`);
    tester.speak(`Cancel an alarm for tomorrow at 7 am`);
    await tester.listenCheck(`^Ok, I've canceled that alarm`, `idle`);
    done();
  });

  // "time": "THH", "date": null
  test(`Alarm test - start an alarm for the same day`, async (done) => {
    let time = moment().add(1, 'm').format('h:mm a');
    tester.speak(`Create an alarm for ${time}`);
    await tester.listenCheck(`^Ok, I've started an alarm`, `idle`);
    tester.speak(`Cancel an alarm for ${time}`);
    await tester.listenCheck(`^Ok, I've canceled that alarm`, `idle`);
    done();
  });

  // "duration": "PT5S", "date": null
  test(`Alarm test - start an alarm with duration`, async (done) => {
    tester.speak(`Create an alarm for 5 seconds`);
    await tester.listenCheck(`^Ok, I've started an alarm`, `idle`);
    let timer = setTimeout(() => assert(false, 'Timer did not expire'), 7000);
    await tester.listenCheck(`^Timer \\d+ has expired`, `idle`);
    clearTimeout(timer);
    done();
  });

  // "time": "YYYY-MM-DDTHH:MM:SS", "date": null
  test(`Alarm test - start an alarm to go off after`, async (done) => {
    tester.speak(`Set the alarm to go off in 5 seconds`);
    await tester.listenCheck(`^Ok, I've started an alarm`, `idle`);
    let timer = setTimeout(() => assert(false, 'Timer did not expire'), 7000);
    await tester.listenCheck(`^Timer \\d+ has expired`, `idle`);
    clearTimeout(timer);
    done();
  });
});
