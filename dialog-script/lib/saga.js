/**
 * @no-flow
 */

import createLog from 'silk-log';
import {call, take} from 'redux-saga/effects';
import invariant from 'assert';

import modifyBabies from './babies/saga';
import startFeeding from './food/saga';

import type {Environment} from './environment';

const log = createLog(`dialog-fuhu-saga`);

export const unknownText =
  `Sorry, I'm not understanding you. Please check out the app for example ` +
  `requests and questions and try again.`;

export default function* (environment: Environment): Generator<any, any, any> { // eslint-disable-line no-undef
  invariant(environment);

  log.info(`Starting saga`);

  const {intentChannel, speak} = environment;

  log.debug(`Starting dialog loop`);

  for (;;) {
    log.debug(`Waiting for next intent`);
    const {intent, entities} = yield take(intentChannel);

    log.debug(`Got intent`, intent, entities);

    switch (intent) {
    case `startFeeding`:
      yield call(startFeeding, environment, null);
      break;
    case `startNursing`:
      yield call(startFeeding, environment, `nursing`);
      break;
    case `startBottleFeeding`:
      yield call(startFeeding, environment, `bottle`);
      break;
    case `register`:
      yield call(modifyBabies, environment, `add`);
      break;
    case `rename`:
      yield call(modifyBabies, environment, `rename`);
      break;
    default:
      log.warn(`Unknown intent`, intent, entities);
      yield call(speak, unknownText, true);
    }
  }
}
