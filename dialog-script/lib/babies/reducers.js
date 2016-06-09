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
  id: number;

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

const log = createLog(`dialog-fuhu-babies-reducers`);

const initialState: State = [];

export default function(state: State = initialState, action: Action): State {
  switch (action.type) {
  case TYPE_RESET:
  case TYPE_RESET_BABIES:
    return initialState.slice();
  case TYPE_ADD: {
    const {id, name} = action.payload;
    return state.concat([{
      id,
      name,
    }]);
  }
  case TYPE_RENAME: {
    const {id, name} = action.payload;
    for (let index = 0; index < state.length; index++) {
      const baby = state[index];
      if (baby.id === id) {
        const copy = state.slice();
        copy[index] = {...baby, name};
        return copy;
      }
    }
    log.warn(`Couldn't find baby id ${id}`);
    return state;
  }
  default:
    return state;
  }
}
