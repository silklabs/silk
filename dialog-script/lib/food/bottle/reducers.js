/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
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

export default function(state: State = initialState, action: Action): State {
  switch (action.type) {
  case TYPE_RESET:
  case TYPE_RESET_FOOD:
    return {...initialState};
  case TYPE_BOTTLE_TYPE:
    return {...state, type: action.payload.type};
  case TYPE_BOTTLE_AMOUNT:
    return {...state, amountMl: action.payload.amountMl};
  default:
    return state;
  }
}
