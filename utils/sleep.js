/* @flow */

/**
 * Classic sleep function waits for N ms duration then resolves.
 */
export default function sleep(duration: number = 0): Promise<any> {
  return new Promise((accept) => {
    setTimeout(accept, duration);
  });
}
