/* global suite */
/* global setup */
/* global test */

import assert from 'assert';
import {buffers, channel} from 'redux-saga';
import {call, cancel, fork, put, take} from 'redux-saga/effects';
import {createMockTask} from 'redux-saga/utils';

import {testScript} from './utils';
import {
  audioEventTask,
  createIntentEventChannel,
  createTextEventChannel,
} from '../lib/environment';
import {
  default as saga,
  forwardTextEventsTask,
  unknownText,
} from '../lib/saga';
import modifyBabies from '../lib/babies/saga';
import startFeeding from '../lib/food/saga';

suite(`saga`, () => {

  const dialogEngine = {};

  let sagaGenerator = null;
  let environment = null;
  let textChannel = null;
  let intentChannel = null;
  let taskEnvironment = null;
  let task = null;

  setup(() => {
    sagaGenerator = saga(dialogEngine);
    assert(sagaGenerator);

    environment = {
      textChannel: channel(),
      intentChannel: channel(),
      speak: () => {},
    };

    task = createMockTask();

    const tasks = {
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
        expect: fork(audioEventTask, dialogEngine),
      }, {
        provide: task,
        expect: fork(forwardTextEventsTask, environment.textChannel, tasks),
      }, {
        provide: task,
        expect: take(environment.intentChannel),
      },
    ]);

    const next = sagaGenerator.next({
      intent: `garbage`,
      entities: [`more`, `garbage`],
    });
    assert(!next.done);
    assert(next.value);
    assert(typeof next.value.CALL.fn === `function`);

    environment.speak = next.value.CALL.fn;
    assert.deepStrictEqual(next.value,
                           call(environment.speak, unknownText, true));

    testScript(sagaGenerator, [
      {
        expect: take(environment.intentChannel),
      },
    ]);

    textChannel = channel();
    intentChannel = channel();
    taskEnvironment = {...environment, textChannel, intentChannel};
    task = createMockTask();
  });

  test(`unknown intent`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `noIdea`, entities: [``]},
        expect: call(environment.speak, unknownText, true),
      },
    ]);
  });

  test(`startFeeding`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `startFeeding`, entities: []},
        expect: call(channel, buffers.none()),
      }, {
        provide: textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: intentChannel,
        expect: fork(startFeeding, taskEnvironment, null),
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
        expect: call(channel, buffers.none()),
      }, {
        provide: textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: intentChannel,
        expect: fork(startFeeding, taskEnvironment, null),
      }, {
        provide: task,
        expect: take(environment.intentChannel),
      }, {
        provide: event,
        expect: put(intentChannel, event),
      },
    ]);
  });

  test(`startNursing`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `startNursing`, entities: []},
        expect: call(channel, buffers.none()),
      }, {
        provide: textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: intentChannel,
        expect: fork(startFeeding, taskEnvironment, `nursing`),
      }, {
        provide: task,
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`startBottleFeeding`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `startBottleFeeding`, entities: []},
        expect: call(channel, buffers.none()),
      }, {
        provide: textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: intentChannel,
        expect: fork(startFeeding, taskEnvironment, `bottle`),
      }, {
        provide: task,
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`register`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `register`, entities: []},
        expect: call(channel, buffers.none()),
      }, {
        provide: textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: intentChannel,
        expect: fork(modifyBabies, taskEnvironment, `add`),
      }, {
        provide: task,
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`rename`, () => {
    testScript(sagaGenerator, [
      {
        provide: {intent: `rename`, entities: []},
        expect: call(channel, buffers.none()),
      }, {
        provide: textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: intentChannel,
        expect: fork(modifyBabies, taskEnvironment, `rename`),
      }, {
        provide: task,
        expect: take(environment.intentChannel),
      },
    ]);
  });

  test(`multiple independent tasks`, () => {
    let event = {intent: `startFeeding`, entities: []};
    testScript(sagaGenerator, [
      {
        provide: event,
        expect: call(channel, buffers.none()),
      }, {
        provide: textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: intentChannel,
        expect: fork(startFeeding, taskEnvironment, null),
      }, {
        provide: task,
        expect: take(environment.intentChannel),
      }, {
        provide: event,
        expect: put(intentChannel, event),
      }, {
        expect: take(environment.intentChannel),
      },
    ]);

    task.setRunning(false);

    testScript(sagaGenerator, [
      {
        provide: event,
        expect: cancel(task),
      },
    ]);

    textChannel = channel();
    intentChannel = channel();
    taskEnvironment = {...environment, textChannel, intentChannel};
    task = createMockTask();

    event = {intent: `startBottleFeeding`, entities: [`baby`]};

    testScript(sagaGenerator, [
      {
        expect: call(channel, buffers.none()),
      }, {
        provide: textChannel,
        expect: call(channel, buffers.none()),
      }, {
        provide: intentChannel,
        expect: fork(startFeeding, taskEnvironment, null),
      }, {
        provide: task,
        expect: take(environment.intentChannel),
      }, {
        provide: event,
        expect: put(intentChannel, event),
      },
    ]);
  });

});
