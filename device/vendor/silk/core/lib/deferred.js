/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * The Deferred pattern is considered "legacy" don't use it unless you
 * need to do something awkward like loop promises with timers.
 *
 * @flow
 */

export type Deferred<T> = {
  promise: Promise<T>,
  accept: (value: Promise<T> | T) => void,
  reject: (error: any) => void,
};

export default function deferred<T>(): Deferred<T> {
  let opts = {};
  opts.promise = new Promise((accept, reject) => {
    opts.accept = accept;
    opts.reject = reject;
  });
  return opts;
}
