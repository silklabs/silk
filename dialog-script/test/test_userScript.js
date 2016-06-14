/* global suite, suiteSetup, suiteTeardown, setup, test */

import mock from 'mock-require';

import * as mockDialogEngine from './mock/dialog-engine';

import invariant from 'assert';

import {testUserScript} from './utils';
import {unknownText} from '../lib/saga';

suite(`userScript`, () => {

  if (process.env.CI === `true`) {
    console.warn(`Skipping userScript tests while running on CI`); // eslint-disable-line no-console
    return;
  }

  let dialogEngine = null;
  let reload = null;

  suiteSetup(() => {
    mock('silk-dialog-engine', mockDialogEngine);

    mockDialogEngine.createDialogEngine({});

    // This configures the dialog engine.
    reload = require('../lib/index').reload;
    invariant(reload);
  });

  suiteTeardown(() => {
    mock.stop('silk-dialog-engine');
  });

  setup(() => {
    invariant(reload);
    reload();

    dialogEngine = mockDialogEngine.default();
    invariant(dialogEngine);
  });

  test(`Unknown intent`, async () => {
    await testUserScript(dialogEngine, [
      {
        speak: `Hello`,
        hear: unknownText,
        finished: true,
      },
    ]);
  });

  test(`Unknown intent multiple times`, async () => {
    await testUserScript(dialogEngine, [
      {
        speak: `Hello`,
        hear: unknownText,
        finished: true,
      }, {
        speak: `What's going on?`,
        hear: unknownText,
        finished: true,
      },
    ]);
  });

  test(`Register baby`, async () => {
    const name = `emily`;
    await testUserScript(dialogEngine, [
      {
        speak: `Register my baby`,
        hear: `What is the baby's name?`,
        finished: false,
      }, {
        speak: name,
        hear: `I heard ${name}. Is that correct?`,
        finished: false,
      }, {
        speak: `Yes`,
        hear: `Ok, ${name} is now registered`,
        finished: true,
      },
    ]);
  });

  test(`Register baby bad name`, async () => {
    const name = `john`;
    await testUserScript(dialogEngine, [
      {
        speak: `Register this baby`,
        hear: `What is the baby's name?`,
        finished: false,
      }, {
        speak: name,
        hear: `I heard ${name}. Is that correct?`,
        finished: false,
      }, {
        speak: `No`,
        hear: `Sorry, I'll try again. What is the baby's name?`,
        finished: false,
      }, {
        speak: name,
        hear: `I heard ${name}. Is that correct?`,
        finished: false,
      }, {
        speak: `Yes`,
        hear: `Ok, ${name} is now registered`,
        finished: true,
      },
    ]);
  });

});
