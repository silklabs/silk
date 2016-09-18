/**
 * @noflow
 */

import assert from 'assert';

import {
  installMocks,
  uninstallMocks,
} from './utils';
import {
  reset,
  speakBegin,
  speakEnd,
  interpretBegin,
  interpretEnd,
} from '../lib/actions';


suite(`store`, () => {

  let store = null;
  let dispatchAndWaitForStateChange = null;
  let initialState = null;

  suiteSetup(async () => {
    installMocks();

    store = await require('../lib/store').default();
    assert(store);

    dispatchAndWaitForStateChange = (action) => {
      return new Promise((resolve) => {
        const unsubscribe = store.subscribe(() => {
          unsubscribe();
          resolve(store.getState());
        });
        store.dispatch(action);
      });
    };

    initialState = store.getState();
  });

  suiteTeardown(() => {
    uninstallMocks();
  });

  setup(async () => {
    dispatchAndWaitForStateChange({type: 'RESET'});
    assert.deepEqual(store.getState(), initialState);
  });

  test(`speaking`, async () => {
    const text = `Hi`;
    let state = await dispatchAndWaitForStateChange(speakBegin(text));
    assert.deepStrictEqual(state, {...initialState, speaking: text});

    state = await dispatchAndWaitForStateChange(speakEnd());
    assert.deepStrictEqual(state, initialState);
  });

  test(`interpreting`, async () => {
    let state = await dispatchAndWaitForStateChange(interpretBegin());
    assert.deepStrictEqual(state, {...initialState, interpreting: true});

    state = await dispatchAndWaitForStateChange(interpretEnd());
    assert.deepStrictEqual(state, initialState);
  });

  test(`reset`, async () => {
    const text = `Hi`;
    let state = await dispatchAndWaitForStateChange(speakBegin(text));
    state = await dispatchAndWaitForStateChange(interpretBegin());
    assert.deepStrictEqual(
      state,
      {...initialState, speaking: text, interpreting: true}
    );

    state = await dispatchAndWaitForStateChange(reset());
    assert.deepStrictEqual(state, initialState);
  });
});
