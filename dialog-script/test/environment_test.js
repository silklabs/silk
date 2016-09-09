/**
 * @noflow
 */

import assert from 'assert';
import EventEmitter from 'events';
import {channel} from 'redux-saga';
import {call, fork, put, take} from 'redux-saga/effects';
import {createMockTask as createMockSaga} from 'redux-saga/utils';

import {
  testScript,
  installMocks,
  uninstallMocks,
} from './utils';

let dialogEngine;
let createEnvironment;
let audioEventSaga;
let createAudioEventChannel;
let createMicEventChannel;
let speakBegin;
let speakEnd;
let interpretEnd;
let timerMonitorSaga;

suite(`environment`, () => {

  // So far all we care about here is that the DialogEngine has |addListener|
  // and |removeListener|.
  suiteSetup(() => {
    installMocks();
    dialogEngine = new EventEmitter();
    createEnvironment = require('../lib/environment').default;
    audioEventSaga = require('../lib/environment').audioEventSaga;
    createAudioEventChannel = require('../lib/environment').createAudioEventChannel;
    createMicEventChannel = require('../lib/environment').createMicEventChannel;
    speakBegin = require('../lib/actions').speakBegin;
    speakEnd = require('../lib/actions').speakEnd;
    interpretEnd = require('../lib/actions').interpretEnd;
    timerMonitorSaga = require('../lib/timers/saga').timerMonitorSaga;
  });

  suiteTeardown(() => {
    uninstallMocks;
  });

  test(`createEnvironment`, () => {
    const micChannel = channel();
    const generator = createEnvironment(dialogEngine);

    testScript(generator, [
      {
        expect: call(createMicEventChannel, dialogEngine),
      }, {
        provide: micChannel,
        expect: fork(audioEventSaga, dialogEngine),
      },
    ]);

    let {done, value} = generator.next(createMockSaga());
    assert(!done);
    assert(value);
    assert(typeof value.FORK.args[0].speak === `function`);

    const environment = {
      dialogEngine,
      micChannel,
      speak: value.FORK.args[0].speak,
    };

    assert.deepStrictEqual(value, fork(timerMonitorSaga, environment));

    ({done, value} = generator.next(createMockSaga()));
    assert(done);
    assert.deepStrictEqual(value, environment);
  });

  test(`audioEventSaga`, () => {
    const generator = audioEventSaga(dialogEngine);
    const audioChannel = channel();
    const error = new Error(`cancel`);
    testScript(generator, [
      {
        expect: call(createAudioEventChannel, dialogEngine),
      }, {
        provide: audioChannel,
        expect: take(audioChannel),
      }, {
        provide: speakBegin(`foo`),
        expect: put(speakBegin(`foo`)),
      }, {
        expect: take(audioChannel),
      }, {
        provide: speakEnd(),
        expect: put(speakEnd()),
      }, {
        expect: take(audioChannel),
      }, {
        error: error,
        expect: [put(speakEnd()), put(interpretEnd())],
      }, {
        done: true,
      },
    ]);
  });

});
