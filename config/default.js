/**
Base configuration for the project.

Every other configuration profile inherits from this (and can override it).
*/

// Provide default connection string...
const DEFAULT_MOGNO = 'mongodb://localhost:27017';

export default {
  server: {
    // location where to start the http server.
    port: process.env.PORT || 5000
  },

  db: {
    connectionString: process.env.MONGODB_CONNECTON_STRING || DEFAULT_MOGNO,
  },

  // Purely here for testing....
  testing: {
    value: false,
    description: 'Purely for testing'
  }
};
