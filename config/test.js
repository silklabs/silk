/**
Configuration profile used in tests.
*/

import defaultConfig from './default';

export default {
  server: {
    // XXX: This should be using 0 and then passing back the on-demand port
    // instead.
    port: 8888
  },

  // Specify a database in addition to the default connection string...
  db: {
    connectionString: `${defaultConfig.db.connectionString}/silk-app-testing`
  },

  testing: {
    value: true
  }
};
