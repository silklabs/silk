import React from 'react-native';

/**
 * Make React component APIs play nicely within async functions.
 *
 * This component accomplishes two things:
 *
 * - Provide setStateAsync, replaceStateAsync methods for React
 *   lifecycle events (state changes) to not run within the same
 *   promise chain as the invoking async function.  That way,
 *   exceptions thrown during (re-)render will not be muffled as
 *   unhandled promise rejections but will surface as actual
 *   exceptions.
 *
 * - Return a promise rather than take a callback argument. That way
 *   one can simply write
 *
 *     await this.setState({foo: 'bar'});
 *     doSomethingWith(this.state.foo);
 *
 *   rather than
 *
 *     this.setState({foo: 'bar'}, () => {
 *       doSomethingWith(this.state.foo);
 *     });
 */
export default class AsyncComponent extends React.Component {

  /**
   * Pending state will always be what `this.state` is at any given
   * point plus any changes that have been staged using the state
   * mutating methods below.
   *
   * This is useful (and necessary) when multiple `setStateAsync`
   * calls depend on previous state to create new state and are
   * fired before the actual state change transition occurs, e.g.:
   *
   *   onSomeSystemOrNetworkEvent = (event) => {
   *     this.setStateAsync({counter: this.state.counter + 1});
   *   };
   *
   * If `onSomeSystemOrNetworkEvent` fires multiple times within the
   * same event loop tick, `counter` is not incremented correctly.
   * Using `pendingState` remedies the situation:
   *
   *   onSomeSystemOrNetworkEvent = (event) => {
   *     this.setStateAsync({counter: this.pendingState.counter + 1});
   *   };
   *
   */
  get pendingState() {
    let pendingState = Object.assign({}, this.state);
    Object.defineProperty(this, 'pendingState', {
      enumerable: true,
      writable: true,
      configurable: true,
      value: pendingState,
    });
    return pendingState;
  }

  componentWillUpdate(nextProps, nextState) {
    // We're about to render. Reset `this.pendingState` to whatever
    // the new `this.state` will be.
    this.pendingState; // ensure the getter is gone
    this.pendingState = Object.assign({}, nextState);
  }

  setState(state) {
    Object.assign(this.pendingState, state);
    return new Promise(
      (resolve, reject) => super.setState(state, resolve)
    );
  }

  replaceState(state) {
    this.pendingState; // ensure the getter is gone
    this.pendingState = Object.assign({}, state);
    return new Promise(
      (resolve, reject) => super.replaceState(state, resolve)
    );
  }

  setStateAsync(state) {
    Object.assign(this.pendingState, state);
    return new Promise(
      (resolve, reject) => requestAnimationFrame(() => super.setState(state, resolve))
    );
  }

  replaceStateAsync(state) {
    this.pendingState; // ensure the getter is gone
    this.pendingState = Object.assign({}, state);
    return new Promise(
      (resolve, reject) => requestAnimationFrame(() => super.replaceState(state, resolve))
    );
  }

}
