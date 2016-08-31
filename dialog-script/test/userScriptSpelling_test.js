/* global suite, suiteSetup, suiteTeardown, setup, test */

import {UserScriptTester} from './utils';
import {encodeBreak} from '../lib/utils';

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

  test(`Spelling test`, async (done) => {
    let word = 'fantabulous';
    tester.speak(`How do you spell ${word}`);
    let spell = '';
    for (let i = 0; i < word.length; i++) {
      spell = spell + encodeBreak(word.charAt(i), 'x-weak');
    }
    await tester.listenCheck(`^${spell}`, `idle`);
    done();
  });
});
