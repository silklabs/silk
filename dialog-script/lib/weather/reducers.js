/**
 * @flow
 */

import {TYPE_RESET} from '../actions';
import {TYPE_UPDATE_LOCATION, TYPE_RESET_LOCATION} from './actions';

import type {Action} from './actions';

export type State = {
  location?: number | string;
};

const initialState: State = {};

export default function(state: State = initialState, action: Action): State {
  switch (action.type) {

  case TYPE_RESET:
  case TYPE_RESET_LOCATION:
    return initialState;

  case TYPE_UPDATE_LOCATION:
    return {...state, location: action.payload.location};

  default:
    return state;
  }
}
