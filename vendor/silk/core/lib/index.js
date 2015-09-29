/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

//
// Version check the base device image before doing anything else
//
let baseversion = {
  actual: 'unknown',
  expected: require('./base_version')
};
try {
  baseversion.actual = require('base_version');
} catch(e) {
  console.error(`Unable to load base_version: ${e}`);
}
if (baseversion.actual !== baseversion.expected) { // TODO: use semver
  console.error('\n' +
                '**********************************\n' +
                ' Device base version mismatch\n' +
                `   Expected base version: ${baseversion.expected}\n` +
                `   Actual base version:   ${baseversion.actual}\n` +
                '**********************************');
  throw new Error('Fatal error');
}

// At the time of this writing, a `debugger;` statement is not triggered until
// the first callback is invoked for an unknown reason. This issue is avoided by
// using a setTimeout() to launch the main program
setTimeout(() => require('./main'), 0);
