/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 *
 * Classic sleep function waits for N ms duration then resolves.
 *
 * @flow
 */

export default function sleep(duration: number = 0): Promise<any> {
  return new Promise((accept) => {
    setTimeout(accept, duration);
  });
}
