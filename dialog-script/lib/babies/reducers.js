/**
 * @flow
 */

import createLog from 'silk-log';

import {
  TYPE_ADD,
  TYPE_RENAME,
  TYPE_RESET_BABIES,
} from './actions';

import {TYPE_RESET} from '../actions';

import type {Action} from './actions';

type BabyState = {
  // Unique identifier.
  id: string;

  // Name.
  name: string;

  // Sex.
  sex?: ('male' | 'female');

  // Height in centimeters, if known.
  heightCm?: number;

  // Weight in kilograms, if known.
  weightKg?: number;
};

export type State = Array<BabyState>;

const log = createLog(`dialog-script-babies-reducers`);

const initialState: State = [];

/**
 * Reducers must be pure functions (i.e. functions that don't depend on any
 * non-local state) that always return new objects if the state has changed or
 * the previous state if nothing has changed. Mutations are not allowed.
 */
export default function(state: State = initialState, action: Action): State {
  switch (action.type) {

  // The initial state can be returned at any time because it will never mutate.
  case TYPE_RESET:
  case TYPE_RESET_BABIES:
    return initialState;

  /**
   * We can't modify the array, so instead we use |concat| to duplicate it and
   * append the new data to the copy.
   */
  case TYPE_ADD: {
    const {id, name} = action.payload;
    return state.concat([{
      id,
      name,
    }]);
  }

  /**
   * We loop through the existing data and only make a copy of the array if we
   * actually change something.
   */
  case TYPE_RENAME: {
    const {id, name} = action.payload;
    for (let index = 0; index < state.length; index++) {
      const baby = state[index];
      if (baby.id === id && baby.name !== name) {
        const copy = state.slice();
        copy[index] = {...baby, name};
        return copy;
      }
    }
    log.warn(`Couldn't find baby id ${id}`);
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
