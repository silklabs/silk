/**
Base configuration for the project.

Every other configuration profile inherits from this (and can override it).
*/

// Provide default connection string...
const DEFAULT_MOGNO = 'mongodb://localhost:27017';
const PORT = process.env.PORT || 5000;

export default {
  server: {
    // Will dynamically configure itself if empty...
    publicUrl: process.env.PUBLIC_URL,

    // location where to start the http server.
    port: PORT,

    // Type of blob to use (see .blobs).
    blobType: 'file'
  },

  blobs: {
    // Local file storage blob.
    file: {
      path: 'tmp/'
    },

    // AWS S3 blob storage.
    s3: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: 'us-west-2',
      bucket: 'silk-blobs-dev-us-west-2'
    }
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
