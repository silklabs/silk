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
import modifyBabies from '../lib/babies/saga';
import startFeeding from '../lib/food/saga';

suite(`saga`, () => {

  const environment = {
    dialogEngine: {},
    textChannel: () => {},
    intentChannel: () => {},
    speak: () => {},
  };

  let sagaGenerator = null;

  setup(() => {
    sagaGenerator = saga(environment);
    assert(sagaGenerator);
  });

  test(`unknown intent`, () => {
    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      }, {
        provide: {intent: 'garbage', entities: [`more garbage`]},
        expect: call(environment.speak, unknownText, true),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`startFeeding`, () => {
    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      }, {
        provide: {intent: 'startFeeding', entities: []},
        expect: call(startFeeding, environment, null),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`startFeeding entities`, () => {
    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      }, {
        provide: {intent: 'startFeeding', entities: [`foo`, `bar`]},
        expect: call(startFeeding, environment, null),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`startNursing`, () => {
    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      }, {
        provide: {intent: 'startNursing', entities: []},
        expect: call(startFeeding, environment, `nursing`),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`startNursing entities`, () => {
    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      }, {
        provide: {intent: 'startNursing', entities: [`foo`, `bar`]},
        expect: call(startFeeding, environment, `nursing`),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`startBottleFeeding`, () => {
    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      }, {
        provide: {intent: 'startBottleFeeding', entities: []},
        expect: call(startFeeding, environment, `bottle`),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`startBottleFeeding entities`, () => {
    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      }, {
        provide: {intent: 'startBottleFeeding', entities: [`foo`, `bar`]},
        expect: call(startFeeding, environment, `bottle`),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`register`, () => {
    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      }, {
        provide: {intent: 'register', entities: []},
        expect: call(modifyBabies, environment, `add`),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`register entities`, () => {
    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      }, {
        provide: {intent: 'register', entities: []},
        expect: call(modifyBabies, environment, `add`),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`rename`, () => {
    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      }, {
        provide: {intent: 'rename', entities: []},
        expect: call(modifyBabies, environment, `rename`),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`rename entities`, () => {
    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      }, {
        provide: {intent: 'rename', entities: []},
        expect: call(modifyBabies, environment, `rename`),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);
  });

});
