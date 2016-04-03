/**
Base configuration for the project.

Every other configuration profile inherits from this (and can override it).
*/

// Provide default connection string...
const DEFAULT_MONGO = 'mongodb://localhost:27017';
const SILK_EMAILS = ['@silk.io', '@silklabs.com'];

export default {

  azure: {
    setServiceProps: true,

    // It's important to note that CORS rules are storage account wide and
    // affect all blobs, queues and tables.
    cors: [{
      allowedOrigins: ['*'],
      allowedHeaders: ['ms-*', '*', 'accept', 'content-type', 'content-length'],
      allowedMethods: ['DELETE', 'GET', 'HEAD', 'MERGE', 'POST', 'OPTIONS', 'PUT'],
      exposedHeaders: ['ms-*', '*'],
      maxAgeInSeconds: 500
    }],

    regions: {
      uswest: process.env.AZURE_TABLE_USWEST,
      useast: process.env.AZURE_TABLE_USEAST,
    },

    tables: {
      // Signaling servers (with related metadata such as load).
      sigservers: 'sigservers',
      // Device -> Signaling server.
      sigdevices: 'sigdevices',
    },
  },

  socketio: {
    // Used by the server to return the address where socket.io server lives.
    publicUrl: process.env.SOCKETIO_PUBLIC_URL || null,

    // Where to bind socket.io
    port: 5001
  },

  signaling: {
    // Having only one single signaling server is more reliable for local testing
    // and demos. When this is set to false we will use the "default" signaling.
    // server url
    useServiceDiscovery: false,

    clients: {
      timeoutMs: 2 * 60 * 1000,
    },

    residents: {
      // How often to check if we need to send a ping.
      checkIntervalMs: 5 * 1000,
      // How often to send a ping per connection.
      pingIntervalMs: 30 * 1000,
      // If we don't get a pong in this amount of time we disconnect.
      pongTimeoutMs: 60 * 1000,
    },

    // Set / used in server if useServiceDiscovery is false.
    publicUrl: process.env.SIGNALING_PUBLIC_URL || null,

    port: process.env.SIGNALING_PORT || 5002,
    host: process.env.SIGNALING_HOST || null,
    // After client timeout we forcefully disconnect clients.
  },

  server: {
    cors: {
      origin: true,
      methods: '*',
      credentials: true
    },

    // Will dynamically configure itself if empty...
    publicUrl: process.env.PUBLIC_URL || null,

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

  /**
   * Primitive scoping mechanism which may be removed in future.
   */
  scopes: {
    // the key is the scope name and the array is email suffix.
    'metrics:query': SILK_EMAILS,
    'crash:find': SILK_EMAILS,
  },

  metrics: {
    // The backend system for our metrics...
    influxdb: {
      connectionString: process.env.INFLUX_CONNECTION_STRING
    }
  },

  resetPassword: {
    url: process.env.PASSWORD_RESET_URL || 'http://localhost:8080/#/forgot_password',
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
      preview: {
        path: 'tmp/preview/'
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

    clouds: {
      aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      },
    },

    // AWS S3 blob storage.
    s3: {
      video: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: 'us-west-2',
        bucket: 'silk-blobs-dev-us-west-2'
      },
      preview: {
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
    },

    // Aliyun OSS blob storage.
    aliyun: {
      video: {
        accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALIYUN_SECRET_ACCESS_KEY,
        host: 'oss-cn-shenzhen.aliyuncs.com',
        bucket: 'silk-blobs-dev-shenzhen'
      },
      preview: {
        accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALIYUN_SECRET_ACCESS_KEY,
        host: 'oss-cn-shenzhen.aliyuncs.com',
        bucket: 'silk-blobs-dev-shenzhen'
      },
      crashreport: {
        accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALIYUN_SECRET_ACCESS_KEY,
        host: 'oss-cn-shenzhen.aliyuncs.com',
        bucket: 'silk-blobs-dev-shenzhen'
      },
      log: {
        accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALIYUN_SECRET_ACCESS_KEY,
        host: 'oss-cn-shenzhen.aliyuncs.com',
        bucket: 'silk-blobs-dev-shenzhen'
      },
      metrics: {
        accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALIYUN_SECRET_ACCESS_KEY,
        host: 'oss-cn-shenzhen.aliyuncs.com',
        bucket: 'silk-blobs-dev-shenzhen'
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
