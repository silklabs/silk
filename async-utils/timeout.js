/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 *
 * Produce a promise rejection after a given duration.
 * Handy for use with Promise.race().
 *
 * @flow
 */
import sleep from './sleep';

export default function timeout(duration: number, error: Error): Promise<void> {
  return sleep(duration).then(() => {
    throw error;
  });
}
