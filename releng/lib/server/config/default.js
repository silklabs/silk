/**
 * Base configuration for the project.
 *
 * Every other configuration profile inherits from this (and can override it).
 *
 * @flow
 */

// Provide default connection string...
const PORT = process.env.PORT || 8000;

module.exports = {
  server: {
    // location where to start the http server.
    port: PORT,
  },

  testing: {
    value: true,
  },
};
