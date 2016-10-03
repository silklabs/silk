/**
 * @flow
 */

import assert from 'assert';
// $FlowFixMe: No idea why but Flow can't see this module.
import createImmutableStateMiddleware from 'redux-immutable-state-invariant';
import createStore from 'silk-redux';

import reducers from '../../lib/store/reducers';
import {
  createNewState,
  load,
  validate,
} from '../../lib/store/persist_reducers';

import type {Store} from '../../lib/store';

suite('persist', () => {

  let store: Store;
  setup(async () => {
    await load('no-persist');
    const middlewares = [createImmutableStateMiddleware()];
    store = createStore(reducers, middlewares, {enableLogging: true});
  });

  test('createNewState validates', async () => {
    const newPersist = await createNewState();
    await validate(newPersist);
  });

  test('initial state', async () => {
    const state = store.getState();
    assert(state);

    const {persist} = state;
    assert(persist);

    await validate(persist);
  });

});
