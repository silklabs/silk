/* global suite */
/* global setup */
/* global test */

import assert from 'assert';
import {call, take} from 'redux-saga/effects';

import {testScript} from './utils';
import {
  default as saga,
  unknownText,
} from '../lib/saga';
import {
  default as createSagaArgs,
} from '../lib/sagaArgs';
import modifyBabies from '../lib/babies/saga';
import startFeeding from '../lib/food/saga';

suite(`saga`, () => {

  const dialogEngine = {};
  const sagaArgs = {
    dialogEngine,
    textChannel: () => {},
    intentChannel: () => {},
    speak: () => {},
  };

  let sagaGenerator = null;

  setup(() => {
    sagaGenerator = saga(dialogEngine);
    assert(sagaGenerator);
  });

  test(`unknown intent`, () => {
    testScript(sagaGenerator, [
      {
        expect: call(createSagaArgs, dialogEngine),
      }, {
        provide: sagaArgs,
        expect: take(sagaArgs.intentChannel),
      }, {
        provide: {intent: 'garbage', entities: [`more garbage`]},
        expect: call(sagaArgs.speak, unknownText, true),
      }, {
        expect: take(sagaArgs.intentChannel),
      },
    ]);
  });

  test(`startFeeding`, () => {
    testScript(sagaGenerator, [
      {
        expect: call(createSagaArgs, dialogEngine),
      }, {
        provide: sagaArgs,
        expect: take(sagaArgs.intentChannel),
      }, {
        provide: {intent: 'startFeeding', entities: []},
        expect: call(startFeeding, sagaArgs, null),
      }, {
        expect: take(sagaArgs.intentChannel),
      },
    ]);
  });

  test(`startFeeding entities`, () => {
    testScript(sagaGenerator, [
      {
        expect: call(createSagaArgs, dialogEngine),
      }, {
        provide: sagaArgs,
        expect: take(sagaArgs.intentChannel),
      }, {
        provide: {intent: 'startFeeding', entities: [`foo`, `bar`]},
        expect: call(startFeeding, sagaArgs, null),
      }, {
        expect: take(sagaArgs.intentChannel),
      },
    ]);
  });

  test(`startNursing`, () => {
    testScript(sagaGenerator, [
      {
        expect: call(createSagaArgs, dialogEngine),
      }, {
        provide: sagaArgs,
        expect: take(sagaArgs.intentChannel),
      }, {
        provide: {intent: 'startNursing', entities: []},
        expect: call(startFeeding, sagaArgs, `nursing`),
      }, {
        expect: take(sagaArgs.intentChannel),
      },
    ]);
  });

  test(`startNursing entities`, () => {
    testScript(sagaGenerator, [
      {
        expect: call(createSagaArgs, dialogEngine),
      }, {
        provide: sagaArgs,
        expect: take(sagaArgs.intentChannel),
      }, {
        provide: {intent: 'startNursing', entities: [`foo`, `bar`]},
        expect: call(startFeeding, sagaArgs, `nursing`),
      }, {
        expect: take(sagaArgs.intentChannel),
      },
    ]);
  });

  test(`startBottleFeeding`, () => {
    testScript(sagaGenerator, [
      {
        expect: call(createSagaArgs, dialogEngine),
      }, {
        provide: sagaArgs,
        expect: take(sagaArgs.intentChannel),
      }, {
        provide: {intent: 'startBottleFeeding', entities: []},
        expect: call(startFeeding, sagaArgs, `bottle`),
      }, {
        expect: take(sagaArgs.intentChannel),
      },
    ]);
  });

  test(`startBottleFeeding entities`, () => {
    testScript(sagaGenerator, [
      {
        expect: call(createSagaArgs, dialogEngine),
      }, {
        provide: sagaArgs,
        expect: take(sagaArgs.intentChannel),
      }, {
        provide: {intent: 'startBottleFeeding', entities: [`foo`, `bar`]},
        expect: call(startFeeding, sagaArgs, `bottle`),
      }, {
        expect: take(sagaArgs.intentChannel),
      },
    ]);
  });

  test(`register`, () => {
    testScript(sagaGenerator, [
      {
        expect: call(createSagaArgs, dialogEngine),
      }, {
        provide: sagaArgs,
        expect: take(sagaArgs.intentChannel),
      }, {
        provide: {intent: 'register', entities: []},
        expect: call(modifyBabies, sagaArgs, `add`),
      }, {
        expect: take(sagaArgs.intentChannel),
      },
    ]);
  });

  test(`register entities`, () => {
    testScript(sagaGenerator, [
      {
        expect: call(createSagaArgs, dialogEngine),
      }, {
        provide: sagaArgs,
        expect: take(sagaArgs.intentChannel),
      }, {
        provide: {intent: 'register', entities: []},
        expect: call(modifyBabies, sagaArgs, `add`),
      }, {
        expect: take(sagaArgs.intentChannel),
      },
    ]);
  });

  test(`rename`, () => {
    testScript(sagaGenerator, [
      {
        expect: call(createSagaArgs, dialogEngine),
      }, {
        provide: sagaArgs,
        expect: take(sagaArgs.intentChannel),
      }, {
        provide: {intent: 'rename', entities: []},
        expect: call(modifyBabies, sagaArgs, `rename`),
      }, {
        expect: take(sagaArgs.intentChannel),
      },
    ]);
  });

  test(`rename entities`, () => {
    testScript(sagaGenerator, [
      {
        expect: call(createSagaArgs, dialogEngine),
      }, {
        provide: sagaArgs,
        expect: take(sagaArgs.intentChannel),
      }, {
        provide: {intent: 'rename', entities: []},
        expect: call(modifyBabies, sagaArgs, `rename`),
      }, {
        expect: take(sagaArgs.intentChannel),
      },
    ]);
  });

});
