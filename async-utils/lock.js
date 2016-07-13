/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 *
 * Generic locking mechanism to be used in classes :
 *
 * import Lock from 'silk-utils/lock';
 *
 * class Foo {
 *   _fooLock: Lock<number> = new Lock();
 *
 *   _doFoo(): Promise<number> {
 *     // ... compute something then return a number ...
 *   }
 *
 *   foo() {
 *     this._fooLock.run(() => {
 *       return this._doFoo();
 *     });
 *   }
 * }
 *
 * @flow
 */

import invariant from 'assert';

export default class Lock<T> {
  _lock: ?Promise<T>;

  async run(fn: () => Promise<T>): Promise<T> {
    // Wait for the lock to free up...
    if (this._lock) {
      await this._lock;
      return this.run(fn);
    }

    let unlock;
    this._lock = new Promise((accept) => {
      unlock = accept;
    });

    try {
      return await fn();
    } catch (err) {
      throw err;
    } finally {
      this._lock = null;
      invariant(unlock);
      unlock();
    }
  }
}
