/**
 * Tests that touch the network should not run on Travis to avoid random network
 * issues that cause CI to fail.  Network integration testing should be done
 * separately.
 */
/* eslint-disable no-console */
export default function() {
  if (process.env.TRAVIS) {
    console.log(`

    TRAVIS env variable detected.  Skipping this test...

  `);
    return true;
  }
  return false;
}
