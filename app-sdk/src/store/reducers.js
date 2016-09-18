/**
 * @flow
 */

import {reducer as api} from './api';
import {reducer as auth} from './auth_reducers';
import {reducer as clients} from './client_reducers';
import {reducer as config} from './config_reducers';
import {reducer as devices} from './device_reducers';
import {reducer as network} from './network_reducers';

import type {ApiState} from './api';
import type {AuthState} from './auth_reducers';
import type {ClientsState} from './client_reducers';
import type {ConfigState} from './config_reducers';
import type {DevicesState} from './device_reducers';
import type {NetworkState} from './network_reducers';

export type {
  ApiState,
  AuthState,
  ClientsState,
  ConfigState,
  DevicesState,
  NetworkState,
};

export type State = {
  api: ApiState;
  auth: AuthState;
  clients: ClientsState,
  config: ConfigState;
  devices: DevicesState;
  network: NetworkState;
};

export {
  api,
  auth,
  clients,
  config,
  devices,
  network,
};
