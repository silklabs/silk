/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */


/**
 * This pattern is considered "legacy" don't use it unless you need to do
 * something awkward like loop promises with timers.
 */
export default function deferred() {
  let opts = {};
  opts.promise = new Promise((accept, reject) => {
    opts.accept = accept;
    opts.reject = reject;
  });
  return opts;
}
