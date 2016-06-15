/**
 * @flow
 */

import {
  TYPE_BOTTLE_TYPE,
  TYPE_BOTTLE_AMOUNT,
} from './actions';
import {TYPE_RESET_FOOD} from '../actions';
import {TYPE_RESET} from '../../actions';

import type {Action} from './actions';

export type State = {
  // Type of food. Null while querying.
  type: ?('formula' | 'milk');

  // Volume of food in milliliters. Null while querying.
  amountMl: ?number;
};

const initialState: State = {
  type: null,
  amountMl: null,
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
  case TYPE_BOTTLE_TYPE:
    return {...state, type: action.payload.type};
  case TYPE_BOTTLE_AMOUNT:
    return {...state, amountMl: action.payload.amountMl};

  /**
   * If we don't know how to handle this action type then we must return the
   * previous state.
   */
  default:
    return state;
  }
}
