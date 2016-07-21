/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

/*
 * Check the bsp api id before doing anything else
 */
const bspVersion = require('silk-bsp-version');
const coreVersion = require('silk-core-version');

if (bspVersion.bsp_api_id !== coreVersion.bsp_api_id) {
  console.error('\n' + // eslint-disable-line no-console
                '**********************************\n' +
                ' BSP API id mismatch\n' +
                `   Required: ${coreVersion.bsp_api_id}\n` +
                `   Actual:   ${bspVersion.bsp_api_id}\n` +
                '**********************************');
  throw new Error('Fatal error');
}

/*
 * At the time of this writing, a `debugger;` statement is not triggered until
 * the first callback is invoked for an unknown reason. This issue is avoided by
 * using a setTimeout() to launch the main program
 */
setTimeout(() => require('./main'), 0);
