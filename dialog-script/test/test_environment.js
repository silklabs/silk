/* global suite */
/* global test */

import assert from 'assert';
import {EventEmitter} from 'events';
import {channel} from 'redux-saga';
import {call, fork, put, take} from 'redux-saga/effects';

import {testScript} from './utils';
import {
  default as createEnvironment,
  audioEventTask,
  createAudioEventChannel,
  createIntentEventChannel,
  createTextEventChannel,
} from '../lib/environment';
import {
  speakEnd,
  interpretEnd,
} from '../lib/actions';

suite(`environment`, () => {

  // So far all we care about here is that the DialogEngine has |addListener|
  // and |removeListener|.
  const dialogEngine = new EventEmitter();

  test(`createEnvironment`, () => {
    const textChannel = {};
    const intentChannel = {};
    const generator = createEnvironment(dialogEngine);
    testScript(generator, [
      {
        expect: call(createTextEventChannel, dialogEngine),
      }, {
        provide: textChannel,
        expect: call(createIntentEventChannel, dialogEngine),
      }, {
        provide: intentChannel,
        expect: fork(audioEventTask, dialogEngine),
      },
    ]);

    const { done, value } = generator.next({});
    assert(done);
    assert(value);
    assert.strictEqual(value.textChannel, textChannel);
    assert.strictEqual(value.intentChannel, intentChannel);
    assert(typeof value.speak === `function`);
  });

  test(`audioEventTask`, () => {
    const generator = audioEventTask(dialogEngine);
    const audioChannel = channel();
    const action = {};
    const error = new Error(`cancel`);
    testScript(generator, [
      {
        expect: call(createAudioEventChannel, dialogEngine),
      }, {
        provide: audioChannel,
        expect: take(audioChannel),
      }, {
        provide: action,
        expect: put(action),
      }, {
        expect: take(audioChannel),
      }, {
        provide: action,
        expect: put(action),
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
