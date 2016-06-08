/**
 * @flow
 */

import createLog from 'silk-log';
import invariant from 'assert';

import saga from './saga';
import store from './store';

import {
  speakBegin,
  speakEnd,
  interpretBegin,
  interpretEnd,
} from './actions';

import type {DialogEngine} from 'silk-dialog-engine/lib/dialogEngine';

const log = createLog('dialog-script');

log.info('Greetings');
export function silkWillUnload() {
  log.info('Farewell');
}

export default function runScript(dialogEngine: DialogEngine) {
  invariant(dialogEngine);
  log.info(`Starting script`);
  log.debug(`Initial state`, store.getState());

  dialogEngine.on(`interpret-begin`, () => store.dispatch(interpretBegin()));
  dialogEngine.on(`interpret-end`, () => store.dispatch(interpretEnd()));

  dialogEngine.on(`speak-begin`, (text) => store.dispatch(speakBegin(text)));
  dialogEngine.on(`speak-end`, () => store.dispatch(speakEnd()));

  store.runSaga(saga, dialogEngine);
}
