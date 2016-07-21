/**
 * @flow
 */

import type {ApiState} from './api';
import type {AuthState} from './auth_reducers';
import type {DevicesState} from './device_reducers';

export type State = {
  api: ApiState;
  auth: AuthState;
  devices: DevicesState;
};

import {reducer as api} from './api';
import {reducer as auth} from './auth_reducers';
import {reducer as devices} from './device_reducers';
export {api, auth, devices};
