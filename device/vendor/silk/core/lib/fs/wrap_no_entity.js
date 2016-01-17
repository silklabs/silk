/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

/**
 * Helper for wrapping ENOENT file system errors
 */
export default async function wrapNoEntity<T>(
  promise: Promise<T>,
  value: ?T = null
): Promise<?T> {
  try {
    return await promise;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return value;
    }
    throw err;
  }
}
