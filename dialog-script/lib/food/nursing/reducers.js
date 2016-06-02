/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
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

const initialState: State = {
  side: 'right',
  timePerSideSec: 10,
  timeRemainingSec: null,
};

export default function(state: State = initialState, action: Action): State {
  switch (action.type) {
  case TYPE_RESET:
  case TYPE_RESET_FOOD:
    return {...initialState};
  case TYPE_SWITCH_SIDE:
    return {...state, side: state.side === 'right' ? 'left' : 'right'};
  case TYPE_REMAINING_TIME_SEC:
    return {...state, timeRemainingSec: action.payload.timeRemainingSec};
  default:
    return state;
  }
}
