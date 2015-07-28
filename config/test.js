/**
Configuration profile used in tests.
*/

import defaultConfig from './default';

export default {
  server: {
    // Test profiles start the server themselves and can find out which port
    // it started on so it is both safe and sane to use 0 (find an open port).
    port: 0
  },

  // Specify a database in addition to the default connection string...
  db: {
    connectionString: `${defaultConfig.db.connectionString}/silk-app-testing`
  },

  testing: {
    value: true
  }
};
