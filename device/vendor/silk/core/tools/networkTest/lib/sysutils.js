/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

export function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function processthrow(e) {
  console.error(e.stack); // eslint-disable-line no-console
  process.exit(1); // eslint-disable-line no-process-exit
}

