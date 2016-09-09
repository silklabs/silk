/**
 * @noflow
 */

import assert from 'assert';
import {buffers, channel} from 'redux-saga';
import {call, fork, put, take} from 'redux-saga/effects';
import {createMockTask as createMockSaga} from 'redux-saga/utils';

import {
  installMocks,
  uninstallMocks,
  makeMicEvent,
  testScript,
} from './utils';

let audioEventSaga;
let cleanupFinishedSagas;
let createMicEventChannel;
let wrapFork;

let modifyBabies;
let startFeeding;
let timerMonitorSaga;

let saga;
let unknownText;

suite(`saga`, () => {

  const dialogEngine = {};

  let sagaGenerator = null;
  let environment = null;
  let sagas = null;
  let sagaEnvironment = null;

  suiteSetup(() => {
    installMocks();
    unknownText = require('../lib/saga').unknownText;
    saga = require('../lib/saga').default;
    audioEventSaga = require('../lib/environment').audioEventSaga;
    cleanupFinishedSagas = require('../lib/environment').cleanupFinishedSagas;
    createMicEventChannel = require('../lib/environment').createMicEventChannel;
    wrapFork = require('../lib/environment').wrapFork;
    modifyBabies = require('../lib/babies/saga').default;
    startFeeding = require('../lib/food/saga').default;
    timerMonitorSaga = require('../lib/timers/saga').timerMonitorSaga;
  });

  suiteTeardown(() => {
    uninstallMocks;
  });

  setup(() => {
    sagaGenerator = saga(dialogEngine);
    assert(sagaGenerator);

    environment = {
      dialogEngine,
      micChannel: channel(),
      speak: () => {},
    };

    sagas = {
      independent: null,
      concurrent: null,
    };

    testScript(sagaGenerator, [
      {
        expect: call(createMicEventChannel, dialogEngine),
      }, {
        provide: environment.micChannel,
        expect: fork(audioEventSaga, dialogEngine),
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
    assert.deepStrictEqual(value, take(environment.micChannel));

    ({done, value} = sagaGenerator.next(makeMicEvent(`garbage`, `garbage`)));
    assert(!done);
    sagas = value.CALL.args[0];
    assert.deepStrictEqual(value, call(cleanupFinishedSagas, sagas));

    testScript(sagaGenerator, [
      {
        expect: call(environment.speak, unknownText, `idle`),
      }, {
        expect: take(environment.micChannel),
      },
    ]);

    sagaEnvironment = {
      ...environment,
      micChannel: channel(),
    };
  });

  test(`unknown intent`, () => {
    testScript(sagaGenerator, [
      {
        provide: makeMicEvent(`who knows`, `yikes`),
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(environment.speak, unknownText, `idle`),
      },
    ]);
  });

  test(`startFeeding`, () => {
    testScript(sagaGenerator, [
      {
        provide: makeMicEvent(`start feeding`, `startFeeding`),
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.micChannel,
        expect: fork(wrapFork, startFeeding, sagaEnvironment, null),
      }, {
        provide: createMockSaga(),
        expect: take(environment.micChannel),
      },
    ]);
  });

  test(`startFeeding multiple`, () => {
    const event = makeMicEvent(`start feeding`, `startFeeding`);
    testScript(sagaGenerator, [
      {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.micChannel,
        expect: fork(wrapFork, startFeeding, sagaEnvironment, null),
      }, {
        provide: createMockSaga(),
        expect: take(environment.micChannel),
      }, {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: put(sagaEnvironment.micChannel, event),
      },
    ]);
  });

  test(`startNursing`, () => {
    testScript(sagaGenerator, [
      {
        provide: makeMicEvent(`i'm nursing`, `startNursing`),
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.micChannel,
        expect: fork(wrapFork, startFeeding, sagaEnvironment, `nursing`),
      }, {
        provide: createMockSaga(),
        expect: take(environment.micChannel),
      },
    ]);
  });

  test(`startBottleFeeding`, () => {
    testScript(sagaGenerator, [
      {
        provide: makeMicEvent(`i'm bottle feeding the baby`,
                              `startBottleFeeding`),
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.micChannel,
        expect: fork(wrapFork, startFeeding, sagaEnvironment, `bottle`),
      }, {
        provide: createMockSaga(),
        expect: take(environment.micChannel),
      },
    ]);
  });

  test(`register`, () => {
    testScript(sagaGenerator, [
      {
        provide: makeMicEvent(`register my baby`, `register`),
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.micChannel,
        expect: fork(wrapFork, modifyBabies, sagaEnvironment, `add`),
      }, {
        provide: createMockSaga(),
        expect: take(environment.micChannel),
      },
    ]);
  });

  test(`rename`, () => {
    testScript(sagaGenerator, [
      {
        provide: makeMicEvent(`rename my baby`, `rename`),
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.micChannel,
        expect: fork(wrapFork, modifyBabies, sagaEnvironment, `rename`),
      }, {
        provide: createMockSaga(),
        expect: take(environment.micChannel),
      },
    ]);
  });

  test(`multiple independent sagas`, () => {
    let event = makeMicEvent(`i'm feeding the baby`, `startFeeding`);
    let saga = createMockSaga();
    testScript(sagaGenerator, [
      {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.micChannel,
        expect: fork(wrapFork, startFeeding, sagaEnvironment, null),
      }, {
        provide: saga,
        expect: take(environment.micChannel),
      }, {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: put(sagaEnvironment.micChannel, event),
      }, {
        expect: take(environment.micChannel),
      },
    ]);

    event = makeMicEvent(`i'm bottle feeding the baby`,
                         `startBottleFeeding`,
                         [`baby`]);

    testScript(sagaGenerator, [
      {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      },
    ]);

    sagas.independent = null;

    sagaEnvironment = {
      ...environment,
      micChannel: channel(),
    };

    testScript(sagaGenerator, [
      {
        expect: call(channel, buffers.none()),
      }, {
        provide: sagaEnvironment.micChannel,
        expect: fork(wrapFork, startFeeding, sagaEnvironment, `bottle`),
      }, {
        provide: createMockSaga(),
        expect: take(environment.micChannel),
      }, {
        provide: event,
        expect: call(cleanupFinishedSagas, sagas),
      }, {
        expect: put(sagaEnvironment.micChannel, event),
      },
    ]);
  });
});
