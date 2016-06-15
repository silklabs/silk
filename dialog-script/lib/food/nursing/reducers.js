/**
 * @flow
 */

import {
  TYPE_SWITCH_SIDE,
  TYPE_REMAINING_TIME_SEC,
} from './actions';
import {TYPE_RESET_FOOD} from '../actions';
import {TYPE_RESET} from '../../actions';

import type {Action} from './actions';

export type State = {
  // Which side we're on
  side: 'left' | 'right';

  timePerSideSec: number;
  timeRemainingSec: ?number;
};

// This is the state that we will use on first boot (or after factory resets).
const initialState: State = {
  side: 'right',
  timePerSideSec: 20,
  timeRemainingSec: null,
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
  case TYPE_RESET_FOOD:
    return initialState;

  /**
   * The "spread operator" |...| unrolls the properties of |state| and then we
   * assign them to a new object. We also assign properties for state that has
   * changed and return the new object. This keeps us from mutating the
   * previous state.
   */
  case TYPE_SWITCH_SIDE:
    return {...state, side: state.side === 'right' ? 'left' : 'right'};
  case TYPE_REMAINING_TIME_SEC:
    return {...state, timeRemainingSec: action.payload.timeRemainingSec};

  /**
   * If we don't know how to handle this action type then we must return the
   * previous state.
   */
  default:
    return state;
  }
}
