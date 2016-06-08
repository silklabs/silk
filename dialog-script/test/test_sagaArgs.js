/* global suite */
/* global test */

import assert from 'assert';
import {call} from 'redux-saga/effects';
import {EventEmitter} from 'events';

import {
  default as createSagaArgs,
  createTextChannel,
  createIntentChannel,
} from '../lib/sagaArgs';

suite(`sagaArgs`, () => {

  // So far all we care about here is that the DialogEngine has |addListener|
  // and |removeListener|.
  const dialogEngine = new EventEmitter();

  test(`sagaArgs`, async () => {
    const generator = createSagaArgs(dialogEngine);
    assert(generator);

    let next = generator.next();
    assert.deepStrictEqual(next.value, call(createTextChannel, dialogEngine));

    const textChannel = createTextChannel(dialogEngine);
    next = generator.next(textChannel);
    assert.deepStrictEqual(next.value, call(createIntentChannel, dialogEngine));

    const intentChannel = createIntentChannel(dialogEngine);
    const sagaArgs = generator.next(intentChannel).value;
    assert.strictEqual(sagaArgs.dialogEngine, dialogEngine);
    assert.strictEqual(sagaArgs.textChannel, textChannel);
    assert.strictEqual(sagaArgs.intentChannel, intentChannel);
    assert(sagaArgs.speak instanceof Function);

    next = generator.next();
    assert.deepStrictEqual(next, {value: undefined, done: true});
  });

});
