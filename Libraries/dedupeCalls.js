/**
 * This is a helper for ensuring particular calls of methods are done in a
 * serial order (no more then one call to the underlying implementation is
 * running at a time).
 *
 * XXX: This has been written a few times I am sure there is a npm module
 * somewhere....
 */

import deepEqual from 'deep-equal';
import createDebug from 'debug';

const KEY = Symbol('serialify');
const debug = createDebug('dedupeCalls');

function wrapMethodAsSerial(context, name, fn) {
  let methodTable = context[KEY][name];

  return async function(...args) {
    debug('invoke', name);
    // Check if we have a pending call...
    if (methodTable.calls.length) {
      for (let i = 0; i < methodTable.calls.length; i++) {
        let call = methodTable.calls[i];
        // If we have a pending call just return a promise for it's value.
        if (deepEqual(call, args)) {
          debug('waiting for pending', name);
          return methodTable.promises[i];
        }
      }
    }

    function clean() {
      // remove the entry for this call so others can directly make calls...
      let idx = methodTable.calls.indexOf(args);
      // Remove previous entries...
      methodTable.calls.splice(idx, 1);
      methodTable.promises.splice(idx, 1);
    }

    // Construct a promise which will cleanup this pending state...
    debug('invoke underlying', name);
    let promise = fn.call(context, ...args)
      .then((value) => {
        clean();
        return value;
      }, (err) => {
        clean();
        throw err;
      });

    methodTable.calls.push(args);
    methodTable.promises.push(promise);
    return promise;
  };
}

/**
 * Usage:
 *
 *    class Foo {
 *      constructor() {
 *        dedupeCalls(this, 'bar', 'qux');
 *      }
 *
 *      async qux() {
 *      }
 *
 *      async bar() {
 *      }
 *    }
 *
 *
 * Multiple concurrent calls to qux/bar will wait for the first promise to
 * resolve and return that value rather then make multiple calls to the
 * underlying qux implementation.
 *
 */
export default function dedupe(context, ...methods) {
  // This will hold all the calls to the methods that we modify.
  context[KEY] = {};
  for (let method of methods) {
    let fn = context[method];
    context[KEY][method] = { calls: [], promises: [] };
    context[method] = wrapMethodAsSerial(context, method, context[method]);
  }
}
