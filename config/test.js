/**
Configuration profile used in tests.
*/

import defaultConfig from './default';

export default {
  socketio: {
    port: 0,
  },

  server: {
    // Test profiles start the server themselves and can find out which port
    // it started on so it is both safe and sane to use 0 (find an open port).
    port: 0
  },

  blobs: {
    s3: {
      video: {
        bucket: 'silk-blobs-test-us-west-2'
      },
      crashreport: {
        bucket: 'silk-blobs-test-us-west-2'
      },
      log: {
        bucket: 'silk-blobs-test-us-west-2'
      },
      metrics: {
        bucket: 'silk-blobs-test-us-west-2'
      }
    }
  },

  // Specify a database in addition to the default connection string...
  db: {
    connectionString: `${defaultConfig.db.connectionString}/silk-app-testing`
  },

  testing: {
    value: true
  }
};
