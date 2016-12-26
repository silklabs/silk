/*
 * @flow
 */

// Waits for N ms duration then resolves.
export default function sleep(duration: number = 0): Promise<void> {
  return new Promise((accept) => {
    setTimeout(accept, duration);
  });
}

