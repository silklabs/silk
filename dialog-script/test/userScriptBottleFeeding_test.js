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
  });

  suiteTeardown(() => {
    uninstallMocks();
  });

  setup(() => {
    invariant(reload);
    reload();

    dialogEngine = mockDialogEngine.default();
    invariant(dialogEngine);
  });

  test(`Bottle feeding 1`, async () => {
    await testUserScript(dialogEngine, [
      {
        speak: `I\'m feeding the baby`,
        hear: `Ok, Are you nursing or bottle feeding?`,
        nextState: `waiting`,
      }, {
        speak: `bottle`,
        hear: `Ok, Are you using breast milk or formula?`,
        nextState: `waiting`,
      }, {
        speak: `formula`,
        hear: `How many milliliters?`,
        nextState: `waiting`,
      }, {
        speak: `100 ML`,
        hear: `Ok, I'll record that.`,
        nextState: `idle`,
      },
    ]);
  });

  test(`Bottle feeding 2`, async () => {
    await testUserScript(dialogEngine, [
      {
        speak: `I\'m feeding the baby`,
        hear: `Ok, Are you nursing or bottle feeding?`,
        nextState: `waiting`,
      }, {
        speak: `bottle`,
        hear: `Ok, Are you using breast milk or formula?`,
        nextState: `waiting`,
      }, {
        speak: `formula`,
        hear: `How many milliliters?`,
        nextState: `waiting`,
      }, {
        speak: `hundred ML`,
        hear: `Ok, I'll record that.`,
        nextState: `idle`,
      },
    ]);
  });
});
