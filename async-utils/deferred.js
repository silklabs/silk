/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 *
 * The Deferred pattern is considered "legacy", but it's sometimes
 * useful when a long-running procedure needs to wait for a different,
 * concurrent async procedure to produce a result. That result can be
 * represented as a Deferred whose promise can be awaited by the first
 * procedure, and resolved by the second procedure, without the first
 * procedure having to have inititated the second one.
 *
 * @flow
 */

export type Deferred<T> = {
  promise: Promise<T>,
  accept: (value: Promise<T> | T) => void,
  reject: (error: any) => void,
};

export default function createDeferred<T>(): Deferred<T> {
  let opts = {};
  opts.promise = new Promise((accept, reject) => {
    opts.accept = accept;
    opts.reject = reject;
  });
  return opts;
}
