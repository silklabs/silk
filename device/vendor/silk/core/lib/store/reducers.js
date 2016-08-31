/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import {reducer as persist} from './persist_reducers';

import type {PersistState} from './persist_reducers';

export type State = {
  persist: PersistState;
};

const reducers: $Shape<State> = {
  persist,
};

export default reducers;
