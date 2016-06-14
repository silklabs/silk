/* global suite */
/* global setup */
/* global test */

import assert from 'assert';
import {buffers, channel} from 'redux-saga';
import {call, fork, put, take} from 'redux-saga/effects';
import {createMockTask as createMockSaga} from 'redux-saga/utils';

import {testScript} from './utils';
import {
  audioEventSaga,
  cleanupFinishedSagas,
  createIntentEventChannel,
  createTextEventChannel,
  forwardTextEventsSaga,
} from '../lib/environment';
import {
  default as saga,
  unknownText,
} from '../lib/saga';
import modifyBabies from '../lib/babies/saga';
import startFeeding from '../lib/food/saga';
import {timerMonitorSaga} from '../lib/timers/saga';

suite(`saga`, () => {

  const dialogEngine = {};

  let sagaGenerator = null;
  let environment = null;
  let sagas = null;
  let sagaEnvironment = null;

  setup(() => {
    sagaGenerator = saga(dialogEngine);
    assert(sagaGenerator);

    environment = {
      textChannel: channel(),
      intentChannel: channel(),
      speak: () => {},
    };

    sagas = {
      independent: null,
      concurrent: null,
    };

    testScript(sagaGenerator, [
      {
        expect: call(createTextEventChannel, dialogEngine),
      }, {
        provide: environment.textChannel,
        expect: call(createIntentEventChannel, dialogEngine),
      }, {
        provide: environment.intentChannel,
        expect: fork(audioEventSaga, dialogEngine),
      }, {
        provide: createMockSaga(),
        expect: fork(forwardTextEventsSaga, environment.textChannel, sagas),
      },
    ]);

    let {done, value} = sagaGenerator.next(createMockSaga());
    assert(!done);
    assert(value);
    assert(typeof value.FORK.args[0].speak === `function`);

    environment.speak = value.FORK.args[0].speak;

    assert.deepStrictEqual(value, fork(timerMonitorSaga, environment));

    ({done, value} = sagaGenerator.next(createMockSaga()));
    assert(!done);
    assert.deepStrictEqual(value, take(environment.intentChannel));

    ({done, value} = sagaGenerator.next({intent: `garbage`, entities: []}));
    assert(!done);
    sagas = value.CALL.args[0];
    assert.deepStrictEqual(value, call(cleanupFinishedSagas, sagas));

    testScript(sagaGenerator, [
      {
        expect: call(environment.speak, unknownText, true),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);

    sagaEnvironment = {
      ...environment,
      textChannel: channel(),
      intentChannel: channel(),
    };
  });

  test(`unknown intent`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `noIdea`, entities: [``]},
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(environment.speak, unknownText, true),
      },
    ]);
  });

  test(`startFeeding`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `startFeeding`, entities: []},
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.intentChannel,
        expect: fork(startFeeding, sagaEnvironment, null),
      }, {
        provide: {},
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`startFeeding multiple`, () => {
    const event = {intent: `startFeeding`, entities: []};
    testScript(sagaGenerator, [
      {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.intentChannel,
        expect: fork(startFeeding, sagaEnvironment, null),
      }, {
        provide: createMockSaga(),
        expect: take(environment.intentChannel),
      }, {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: put(sagaEnvironment.intentChannel, event),
      },
    ]);
  });

  test(`startNursing`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `startNursing`, entities: []},
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.intentChannel,
        expect: fork(startFeeding, sagaEnvironment, `nursing`),
      }, {
        provide: createMockSaga(),
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`startBottleFeeding`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `startBottleFeeding`, entities: []},
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.intentChannel,
        expect: fork(startFeeding, sagaEnvironment, `bottle`),
      }, {
        provide: createMockSaga(),
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`register`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `register`, entities: []},
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.intentChannel,
        expect: fork(modifyBabies, sagaEnvironment, `add`),
      }, {
        provide: createMockSaga(),
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`rename`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `rename`, entities: []},
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.intentChannel,
        expect: fork(modifyBabies, sagaEnvironment, `rename`),
      }, {
        provide: createMockSaga(),
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`multiple independent sagas`, () => {
    let event = {intent: `startFeeding`, entities: []};
    let saga = createMockSaga();
    testScript(sagaGenerator, [
      {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.intentChannel,
        expect: fork(startFeeding, sagaEnvironment, null),
      }, {
        provide: saga,
        expect: take(environment.intentChannel),
      }, {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: put(sagaEnvironment.intentChannel, event),
      }, {
        expect: take(environment.intentChannel),
      }, {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      },
    ]);

    sagas.independent = null;

    sagaEnvironment = {
      ...environment,
      textChannel: channel(),
      intentChannel: channel(),
    };

    event = {intent: `startBottleFeeding`, entities: [`baby`]};

    testScript(sagaGenerator, [
      {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.intentChannel,
        expect: fork(startFeeding, sagaEnvironment, null),
      }, {
        provide: createMockSaga(),
        expect: take(environment.intentChannel),
      }, {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: put(sagaEnvironment.intentChannel, event),
      },
    ]);
  });

});
