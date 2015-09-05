/**
Base configuration for the project.

Every other configuration profile inherits from this (and can override it).
*/

// Provide default connection string...
const DEFAULT_MONGO = 'mongodb://localhost:27017';
const PORT = process.env.PORT || 5000;

export default {

  socketio: {
    // Used by the server to return the address where socket.io server lives.
    publicUrl: process.env.SOCKETIO_PUBLIC_URL,

    // Where to bind socket.io
    port: 5001
  },

  server: {
    cors: {
      origin: '*',
      methods: '*'
    },

    // Will dynamically configure itself if empty...
    publicUrl: process.env.PUBLIC_URL,

    // location where to start the http server.
    port: 5000,

    // Type of blob to use (see .blobs).
    blobType: process.env.BLOB_TYPE || 'file'
  },

  emails: {
    // XXX: Obviously once our domains are verified we should use real
    // addresses!
    sender: 'james@silklabs.com',
    reciever: 'james@silklabs.com'
  },

  ses: {
    region: 'us-west-2'
  },

  blobs: {
    // Local file storage blob.
    file: {
      video: {
        path: 'tmp/video/'
      },
      crashreport: {
        path: 'tmp/crashreport/'
      },
      log: {
        path: 'tmp/log/'
      },
      metrics: {
        path: 'tmp/metrics/'
      }
    },

    // AWS S3 blob storage.
    s3: {
      video: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: 'us-west-2',
        bucket: 'silk-blobs-dev-us-west-2'
      },
      crashreport: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: 'us-west-2',
        bucket: 'silk-blobs-dev-us-west-2'
      },
      log: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: 'us-west-2',
        bucket: 'silk-blobs-dev-us-west-2'
      },
      metrics: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: 'us-west-2',
        bucket: 'silk-blobs-dev-us-west-2'
      }
    }
  },

  db: {
    connectionString: process.env.MONGODB_CONNECTON_STRING || DEFAULT_MONGO,
  },

  inbox: {
    path: 'inbox/'
  },

  // Purely here for testing....
  testing: {
    value: false,
    description: 'Purely for testing'
  }
};
