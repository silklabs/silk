/**
 * @flow
 */

import createReduxLogger from 'redux-logger';
import createLog from 'silk-log';

import type {Action} from './action';

const log = createLog(`redux`);

const defaultLogOptions = {
  level: {
    prevState: `verbose`,
    action: `info`,
    nextState: `verbose`,
    error: `error`,
  },
  logger: {
    ...log,
    log: log.info,
  },
  actionTransformer: (action: Action<*, *, *>) => {
    const {type, error} = action;
    if (action.requested) {
      return {type, requested: true};
    }
    if (error) {
      return {type, error, payload: action.payload};
    }
    return {type, payload: action.payload};
  },
  colors: {
    title: false,
    prevState: false,
    action: false,
    nextState: false,
    error: false,
  },
  timestamp: false,
};

export default function createLogger(options?: Object) {
  options = {...defaultLogOptions, ...options};
  return createReduxLogger(options);
}
