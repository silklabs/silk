/**
 * @flow
 */

import {call, take} from 'redux-saga/effects';
import invariant from 'assert';
import type {Environment} from '../environment';
import type {Entities} from 'silk-dialog-engine';

const MAX_COUNT = 25;

function* queryKeyword(
  environment: Environment,
  count: number,
): Generator<Object, ?number, any> {
  const {dialogEngine, micChannel, speak} = environment;
  dialogEngine.saveUtterance = true;
  dialogEngine.utteranceType = 'keyword_pos';

  for (let i = 0; i < count; i++) {
    const event = yield take(micChannel);
    invariant(event);

    const {intent} = event;
    if (intent === 'cancel') {
      yield call(speak, `Canceled recording keywords`, `idle`);
      break;
    }

    let done = ` You are all done`;
    let text = `Count ${i + 1} of ${count}.`;
    if (i < (count - 1)) {
      yield call(speak, text, `waiting`);
    } else {
      yield call(speak, text + done, `idle`); // All done
    }
  }
  dialogEngine.saveUtterance = false;
  dialogEngine.utteranceType = 'unknown';
}

export function* recordKeyword(
  environment: Environment,
  entities: Entities
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  let count = 0;
  for (let entity of entities) {
    if (entity.type === 'builtin.number') {
      count = parseInt(entity.entity);
      break;
    }
  }

  if ((count < 1) || (count > MAX_COUNT)) {
    yield call(speak, `Please make sure that count is between 1 and ${MAX_COUNT}`, `idle`);
    return;
  }

  yield call(speak, `Start speaking the keyword. You can speak cancel anytime to cancel the session`,
      `waiting`);
  yield call(queryKeyword, environment, count);
}
