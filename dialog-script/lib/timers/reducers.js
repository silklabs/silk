/**
 * @flow
 */

import createLog from 'silk-log';

import {
  TYPE_ADD,
  TYPE_EXPIRE,
  TYPE_REMOVE,
  TYPE_REMOVE_ALL,
} from './actions';

import {TYPE_RESET} from '../actions';

import type {Action} from './actions';

export type TimerState = {
  id: number;
  durationMs: number;
  expiresMs: number;
};

export type State = {
  nextTimerId: number;

  timers: Array<TimerState>;
};

const log = createLog(`dialog-script-timers-reducers`);

const initialState: State = {
  nextTimerId: 0,
  timers: [],
};

export default function(state: State = initialState, action: Action): State {
  switch (action.type) {
  case TYPE_RESET:
    return {...initialState};
  case TYPE_REMOVE_ALL:
    return {...state, timers: []};
  case TYPE_ADD: {
    // $FlowFixMe: Dunno why it doesn't like this.
    const {durationMs, expiresMs} = action.payload;
    const timerId = state.nextTimerId;
    return {
      ...state,
      nextTimerId: timerId + 1,
      timers: state.timers.concat({
        id: timerId,
        durationMs,
        expiresMs,
      }),
    };
  }
  case TYPE_EXPIRE:
  case TYPE_REMOVE: {
    const {id} = action.payload;
    for (let index = 0; index < state.timers.length; index++) {
      const timer = state.timers[index];
      if (timer.id === id) {
        const timers = state.timers.slice();
        timers.splice(index, 1);
        return {...state, timers};
      }
    }
    log.warn(`Couldn't find timer id ${id}`);
    return state;
  }
  default:
    return state;
  }
}
