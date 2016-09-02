/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import createStore from 'silk-redux';

// $FlowFixMe: No idea why but Flow can't see this module.
import immutableStateInvariantMiddleware from 'redux-immutable-state-invariant';

import reducers from './reducers';
import {load, save} from './persist_reducers';

import type {Store as GenericStore} from 'silk-redux';
import type {State} from './reducers';

export type Store = GenericStore<State>;
export type {State};

const SAVE_DELAY_MS = 200;

const middleware = immutableStateInvariantMiddleware();

let loaded = false;
let store: ?Store = null;
let saveTimeout: ?number = null;

export async function loadStore(): Promise<void> {
  if (loaded) {
    return;
  }
  await load();
  loaded = true;
}

export default function getStore(): Store {
  if (!loaded) {
    throw new Error(`Must call and wait for loadStore() first`);
  }

  if (!store) {
    store = createStore(reducers, undefined, middleware);

    // Watch for changes to save back to disk.
    store.subscribeToPath(`persist`, (newPersist, oldPersist) => {
      if (newPersist === oldPersist) {
        return;
      }

      // Delay this just a little so that we don't write for every change in the
      // delay window.
      if (!saveTimeout) {
        saveTimeout = setTimeout(() => {
          invariant(store);
          saveTimeout = null;
          save(store.getState().persist);
        }, SAVE_DELAY_MS);
      }
    });
  }

  return store;
}
