/**
 * Drain a stream into an array ...
 *
 * @flow
 */

import eventToPromise from 'event-to-promise';

import type { Readable } from 'stream';

export default async function<T> (stream: Readable): Array<T> {
  let output = [];
  stream.on('data', (buffer) => output.push(buffer));
  await eventToPromise(stream, 'end');
  return output;
}
