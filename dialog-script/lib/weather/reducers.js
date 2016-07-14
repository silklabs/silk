/**
 * @flow
 */

import {TYPE_RESET} from '../actions';
import {TYPE_UPDATE_ZIPCODE, TYPE_RESET_ZIPCODE} from './actions';

import type {Action} from './actions';

export type State = {
  zipcode?: number;
};

const initialState: State = {};

export default function(state: State = initialState, action: Action): State {
  switch (action.type) {

  case TYPE_RESET:
  case TYPE_RESET_ZIPCODE:
    return initialState;

  case TYPE_UPDATE_ZIPCODE:
    return {...state, zipcode: action.payload.zipcode};

  default:
    return state;
  }
}
