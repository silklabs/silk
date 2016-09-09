/**
 * @flow
 */

import invariant from 'assert';

import {
  installMocks,
  uninstallMocks,
  testUserScript,
} from './utils';

import * as mockDialogEngine from './mock/dialog-engine';

let unknownText;

suite(`userScript`, () => {

  if (process.env.CI === `true`) {
    console.warn(`Skipping userScript tests while running on CI`); // eslint-disable-line no-console
    return;
  }

  let dialogEngine = null;
  let reload = null;

  suiteSetup(() => {
    installMocks();
    mockDialogEngine.createDialogEngine({});

    // This configures the dialog engine.
    reload = require('../lib/index').reload;
    invariant(reload);

    unknownText = require('../lib/saga').unknownText;
  });

  suiteTeardown(() => {
    uninstallMocks;
  });

  setup(done => {
    // Luis is rate limits at 5QPS.
    // Run tests sequentially and wait a little between runs.
    setTimeout(() => {
      invariant(reload);
      reload();

      dialogEngine = mockDialogEngine.default();
      invariant(dialogEngine);
      done && done();
    }, 500);
  });

  test(`Unknown intent`, async (done) => {
    await testUserScript(dialogEngine, [
      {
        speak: `Hello`,
        hear: unknownText,
        nextState: `idle`,
      },
    ]);
    done && done();
  });

  test(`Unknown intent multiple times`, async (done) => {
    await testUserScript(dialogEngine, [
      {
        speak: `Hello`,
        hear: unknownText,
        nextState: `idle`,
      }, {
        speak: `What's really going on?`,
        hear: unknownText,
        nextState: `idle`,
      },
    ]);
    done && done();
  });

  test(`Register baby`, async (done) => {
    const name = `emily`;
    await testUserScript(dialogEngine, [
      {
        speak: `Register my baby`,
        hear: `What is the baby's name?`,
        nextState: `waiting`,
      }, {
        speak: name,
        hear: `I heard ${name}. Is that correct?`,
        nextState: `waiting`,
      }, {
        speak: `Yes`,
        hear: `Ok, ${name} is now registered`,
        nextState: `idle`,
      },
    ]);
    done && done();
  });

  test(`Register baby bad name`, async (done) => {
    const name = `john`;
    await testUserScript(dialogEngine, [
      {
        speak: `Register my baby`,
        hear: `What is the baby's name?`,
        nextState: `waiting`,
      }, {
        speak: name,
        hear: `I heard ${name}. Is that correct?`,
        nextState: `waiting`,
      }, {
        speak: `No`,
        hear: `Sorry, I'll try again. What is the baby's name?`,
        nextState: `waiting`,
      }, {
        speak: name,
        hear: `I heard ${name}. Is that correct?`,
        nextState: `waiting`,
      }, {
        speak: `Yes`,
        hear: `Ok, ${name} is now registered`,
        nextState: `idle`,
      },
    ]);
    done && done();
  });

});
