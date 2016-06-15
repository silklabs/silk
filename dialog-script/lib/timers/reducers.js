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

/**
 * Reducers must be pure functions (i.e. functions that don't depend on any
 * non-local state) that always return new objects if the state has changed or
 * the previous state if nothing has changed. Mutations are not allowed.
 */
export default function(state: State = initialState, action: Action): State {
  switch (action.type) {

  // The initial state can be returned at any time because it will never mutate.
  case TYPE_RESET:
    return initialState;

  /**
   * Return a new object with all the same data as |state| but then make
   * |timers| be a new empty array.
   */
  case TYPE_REMOVE_ALL:
    return {...state, timers: []};

  /**
   * Return a new object with all the same data as |state| but then increment
   * the |nextTimerId| and use |concat| to make a new |timers| array with the
   * additional timer.
   */
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

  /**
   * |TYPE_EXPIRE| and |TYPE_REMOVE| have different meanings elsewhere but here
   * all we care about is that we should remove a timer from our array so we
   * handle both actions identically.
   *
   * Return a new object with all the same data as |state| but then duplicate
   * the |timers| array using |slice| and |splice| out the timer that we need to
   * remove.
   *
   */
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

  /**
   * If we don't know how to handle this action type then we must return the
   * previous state.
   */
  default:
    return state;
  }
}
