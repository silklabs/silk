/**
 * @flow
 */

import createStore from '../store';
import {reducer as messages} from './reducers';

import type {State, Store} from '../store';
import type {MessagesState} from './reducers';

export type SDKState = State & {
  messages: MessagesState;
};
export type SDKStore = Store<SDKState>;

export default function createSDKStore(): SDKStore {
  return createStore({messages});
}
