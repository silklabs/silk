/**
 * @flow
 */

import {combineReducers} from 'redux';

import bottle from './bottle/reducers';
import nursing from './nursing/reducers';

import type {State as BottleState} from './bottle/reducers';
import type {State as NursingState} from './nursing/reducers';

export type State = {
  bottle: BottleState,
  nursing: NursingState,
};

/**
 * Combine the states of |bottle| and |nursing| together into a single object.
 * The resulting state will look like:
 *
 *   {
 *     bottle: {...}, // BottleState
 *     nursing: {...}, // NursingState
 *   }
 */
export default combineReducers({
  bottle,
  nursing,
});
