/* @flow */

import invariant from 'assert';
import {sleep} from 'silk-async-utils';

type Options = {
  timeout?: number;
  sleep?: number;
};

type WaitFn = () => Promise<any>;

const DEFAULT_OPTIONS = {
  timeout: 10 * 1000, // default overall timeout ...
  sleep: 50, // default sleep interval between attempts ...
};

/**
 * Wait until an async condition returns true or throw an error if it fails to
 * succeed eventually.
 *
 * ```js
 * waitFor({ sleep: 50 }, async () => {
 *   // do stuff then return a truthy value when done ...
 *   return { woot: true };
 * })
 * ```
 *
 */
export default async function waitFor(
  options: Options,
  waitFn: WaitFn,
): Promise<any> {
  let opts = Object.assign({}, DEFAULT_OPTIONS, options);
  let start = Date.now();

  invariant(typeof opts.sleep === 'number');
  invariant(typeof opts.timeout === 'number');

  while ((Date.now() - start) < opts.timeout) {
    let res = await waitFn();
    if (res) {
      return res;
    }
    await sleep(opts.sleep);
  }
  throw new Error(`Wait for failed after ${opts.timeout} ms\n`);
}
