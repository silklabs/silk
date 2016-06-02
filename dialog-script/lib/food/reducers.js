/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
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

export default combineReducers({
  bottle,
  nursing,
});
