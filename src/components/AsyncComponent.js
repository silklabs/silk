import React from 'react-native';

/**
 * Make React component APIs play nicely within async functions.
 *
 * This component accomplishes two things:
 *
 * - Provide methods for React lifecycle events (state changes) to not
 *   run within the same promise chain as the invoking async function.
 *   That way, exceptions thrown during (re-)render will not be
 *   muffled as unhandled promise rejections but will surface as
 *   actual exceptions.
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
export default class extends React.Component {

  setState(state) {
    return new Promise(
      (resolve, reject) => super.setState(state, resolve)
    );
  }

  replaceState(state) {
    return new Promise(
      (resolve, reject) => super.replaceState(state, resolve)
    );
  }

  setStateAsync(state) {
    return new Promise(
      (resolve, reject) => setTimeout(() => super.setState(state, resolve), 0)
    );
  }

  replaceStateAsync(state) {
    return new Promise(
      (resolve, reject) => setTimeout(() => super.replaceState(state, resolve), 0)
    );
  }

}
