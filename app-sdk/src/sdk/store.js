/**
 * @flow
 */

import createStore from '../store';
import {reducer as messages} from './message_reducers';

import type {State, Store} from '../store';
import type {MessagesState} from './message_reducers';

export type SDKState = State & {
  messages: MessagesState;
};
export type SDKStore = Store<SDKState>;

export default function createSDKStore(): SDKStore {
  return createStore({messages});
}
