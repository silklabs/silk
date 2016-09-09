/**
 * Configuration profile used in tests.
 *
 * @flow
 */

module.exports = {
  server: {
    // Test profiles start the server themselves and can find out which port
    // it started on so it is both safe and sane to use 0 (find an open port).
    port: 0,
  },
};
