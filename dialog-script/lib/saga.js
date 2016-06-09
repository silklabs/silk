/**
 * @no-flow
 */

import createLog from 'silk-log';
import {call, take} from 'redux-saga/effects';
import invariant from 'assert';

import createSagaArgs from './sagaArgs';
import modifyBabies from './babies/saga';
import startFeeding from './food/saga';

import type {SagaArgs} from './sagaArgs';
import type {DialogEngine} from '../../lib/dialogEngine';

const log = createLog(`dialog-fuhu-saga`);

export const unknownText =
  `Sorry, I'm not understanding you. Please check out the app for example ` +
  `requests and questions and try again.`;

export default function* (
  dialogEngine: DialogEngine,
): Generator<any, any, any> {                    // eslint-disable-line no-undef
  invariant(dialogEngine);

  log.info(`Starting saga`);
  const sagaArgs: SagaArgs = yield call(createSagaArgs, dialogEngine);
  const {intentChannel, speak} = sagaArgs;

  log.debug(`Starting dialog loop`);

  for (;;) {
    log.debug(`Waiting for next intent`);
    const {intent, entities} = yield take(intentChannel);

    log.debug(`Got intent`, intent, entities);

    switch (intent) {
    case `startFeeding`:
      yield call(startFeeding, sagaArgs, null);
      break;
    case `startNursing`:
      yield call(startFeeding, sagaArgs, `nursing`);
      break;
    case `startBottleFeeding`:
      yield call(startFeeding, sagaArgs, `bottle`);
      break;
    case `register`:
      yield call(modifyBabies, sagaArgs, `add`);
      break;
    case `rename`:
      yield call(modifyBabies, sagaArgs, `rename`);
      break;
    default:
      log.warn(`Unknown intent`, intent, entities);
      yield call(speak, unknownText, true);
    }
  }
}
