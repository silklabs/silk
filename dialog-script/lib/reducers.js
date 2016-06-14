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

import babies from './babies/reducers';
import food from './food/reducers';
import timers from './timers/reducers';

import type {Action} from 'redux';

import type {State as BabiesState} from './babies/reducers';
import type {State as FoodState} from './food/reducers';
import type {State as TimersState} from './timers/reducers';

/**
 * Reducers must be pure functions (i.e. functions that don't depend on any
 * non-local state) that always return new objects if the state has changed or
 * the previous state if nothing has changed. Mutations are not allowed.
 *
 * The only way to modify the state is to use the |put| saga effect.
 */

// This is the basic shape of our state object.
export type State = {
  babies: BabiesState;
  speaking: ?string;
  interpreting: boolean;
  food: FoodState,
  timers: TimersState;
};

// Simple state that records text currently playing through the speakers.
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

/**
 * Simple state that records whether or not the speech-to-intent engine is
 * actively interpreting.
 */
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

/**
 * |combineReducers| combines the state from each of its arguments into a single
 * tree structure. Each sub-reducer defines its own structure that gets built
 * into this tree also. For instance, at the time of this writing,
 * |combineReducers| turns these arguments:
 *
 *   combineReducers({
 *     babies,
 *     speaking,
 *     interpreting,
 *     food,
 *     timers,
 *   });
 *
 * into a state tree that looks like:
 *
 *   {
 *     babies: [],
 *     speaking: null,
 *     interpreting: false,
 *     food: {
 *       bottle: {
 *         type: null,
 *         amountMl: null,
 *       },
 *       nursing: {
 *         side: 'right',
 *         timePerSideSec: 20,
 *         timeRemainingSec: null,
 *       },
 *     },
 *     timers: {
 *       nextTimerId: 0,
 *       timers: [],
 *     },
 *   }
 */
export default combineReducers({
  babies,
  speaking,
  interpreting,
  food,
  timers,
});
