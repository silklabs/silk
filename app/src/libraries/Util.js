/**
 * @flow
 */

import invariant from 'assert';
import { NativeModules } from 'react-native';
import makeLog from 'log';

const { SLKUtil } = NativeModules;

type WifiInfo = {
  SSID: string;
};

/**
 * Get information about the WiFi network we're currently connected to.
 */
export function getWifiInfo(): Promise<WifiInfo> {
  return new Promise((resolve, reject) => {
    return SLKUtil.getWifiInfo((err, info) => {
      return err ? reject(err) : resolve(info);
    });
  });
}

/**
 * Cause the app to exit (= crash in a way that Raygun won't register
 * it as a crash).
 */
export function exitApp() {
  SLKUtil.exitApp();
}

/**
 * Very crude (but fast) way to determine whether a React component's
 * state has changed. This doesn't detect if `newState` has keys that
 * are not present in `oldState`. It's assumed that the consumer was a
 * good citizen and declared all possible state members ahead of time.
 */
export function isStateIdentical(
  oldState: any,
  newState: any
): boolean {
  if (!oldState) {
    return !newState;
  }
  if (__DEV__) {
    invariant(Object.keys(oldState).length === Object.keys(newState).length);
  }
  for (let key in oldState) {
    if (oldState[key] !== newState[key]) {
      return false;
    }
  }
  return true;
}

/**
 * An implementation of React's `shouldComponentUpdate` API that
 * prevents a component from going through a potentially expensive
 * re-render if the variables in its props and states are unchanged.
 *
 * FWIW, this should be the case for most of our components. Though in
 * practice, it's only necessary to use this in certain key components
 * to prevent a whole slew of child components from getting re-rendered.

 * Note: Because this implementation uses `isStateIdentical`, all
 * props and all state keys need to be provided from the beginning.
 * This is not a concern if a component takes no props, has only
 * required props, or has only one entry point.
 */
export function shouldPureComponentUpdate(
  nextProps: any,
  nextState: any
): boolean {
  let shouldUpdate = (
    !isStateIdentical(this.state, nextState) ||
    !isStateIdentical(this.props, nextProps)
  );
  if (__DEV__ && !shouldUpdate) {
    let componentName = this.constructor.name || 'Unknown';
    let log = makeLog(componentName);
    log.debug(`Not updating ${componentName}, state and props didn't change.`);
  }
  return shouldUpdate;
}
