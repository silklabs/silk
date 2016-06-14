/* global suite, suiteSetup, suiteTeardown, setup, test */

import mock from 'mock-require';

import * as mockDialogEngine from './mock/dialog-engine';

import invariant from 'assert';

import {testUserScript} from './utils';

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

  test(`Bottle feeding`, async () => {
    await testUserScript(dialogEngine, [
      {
        speak: `I\'m feeding the baby`,
        hear: `Ok, Are you nursing or bottle feeding?`,
        finished: false,
      }, {
        speak: `bottle`,
        hear: `Ok, Are you using breast milk or formula?`,
        finished: false,
      }, {
        speak: `formula`,
        hear: `How many milliliters?`,
        finished: false,
      }, {
        speak: `100 ML`,
        hear: `Ok, I'll record that.`,
        finished: true,
      },
    ]);
  });


});
