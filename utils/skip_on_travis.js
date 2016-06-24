/**
 * Usage:
 *
 *  skipOnTravis(test, 'My test', async () => {
 *
 *  }))
 *
 * @flow
 */
export default function skipOnTravis(
  testFn: Function,
  name: string,
  testHandler: Function,
): void {
  const fn = ('TRAVIS' in process.env) ? testFn.skip : testFn;
  return fn(name, testHandler);
}
