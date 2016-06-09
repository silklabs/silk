/**
 * @flow
 */

import {combineReducers} from 'redux';

import {
  TYPE_RESET,
  TYPE_SPEAK_BEGIN,
  TYPE_SPEAK_END,
  TYPE_INTERPRET_BEGIN,
  TYPE_INTERPRET_END,
} from './actions';
import {TYPE_ADD as TYPE_BABIES_ADD} from './babies/actions';

import babies from './babies/reducers';
import food from './food/reducers';

import type {Action} from 'redux';

import type {State as BabiesState} from './babies/reducers';
import type {State as FoodState} from './food/reducers';

export type State = {
  nextBabyId: number;
  babies: BabiesState;
  speaking: ?string;
  interpreting: boolean;
  food: FoodState,
};

function nextBabyId(state: number = 0, action: Action): number {
  switch (action.type) {
  case TYPE_RESET:
    return 0;
  case TYPE_BABIES_ADD:
    return state + 1;
  default:
    return state;
  }
}

function speaking(state: ?string = null, action: Action): ?string {
  switch (action.type) {
  case TYPE_SPEAK_BEGIN:
    return action.payload.text;
  case TYPE_SPEAK_END:
  case TYPE_RESET:
    return null;
  default:
    return state;
  }
}

function interpreting(state: boolean = false, action: Action): boolean {
  switch (action.type) {
  case TYPE_INTERPRET_BEGIN:
    return true;
  case TYPE_INTERPRET_END:
  case TYPE_RESET:
    return false;
  default:
    return state;
  }
}

export default combineReducers({
  nextBabyId,
  babies,
  speaking,
  interpreting,
  food,
});
