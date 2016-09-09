/**
 * Like redux-watch, except the new and old state are also provided to
 * the subscriber.
 *
 * @flow
 */

import objectPath from 'object-path';

export type PathSubscriber<S, T> = (
  newValue: T,
  oldValue: T,
  newState: S,
  oldState: S
) => mixed;

type ReduxSubscriber = () => mixed;

/**
 * Wrap a PathSubscriber and return a ReduxSubscriber
 */
export default function watch<S>(
  getState: () => S,
  path: string,
  subscriber: PathSubscriber<S, *>
): ReduxSubscriber {
  let currentState = getState();
  let currentValue = objectPath.get(currentState, path);
  return function () {
    const newState = getState();
    const newValue = objectPath.get(newState, path);
    if (currentValue !== newValue) {
      const oldState = currentState;
      const oldValue = currentValue;
      currentState = newState;
      currentValue = newValue;
      subscriber(newValue, oldValue, newState, oldState);
    }
  };
}
