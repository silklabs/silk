/* @flow */
import sleep from './sleep';

/**
 * For use with Promise.race ... This function will produce a promise rejection.
 */
export default function timeout(duration: number, error: Error): Promise<void> {
  return sleep(duration).then(() => {
    throw error;
  });
}
