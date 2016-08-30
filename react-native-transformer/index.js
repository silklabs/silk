'use strict';

/* eslint-disable camelcase */

const path = require('path');
const babel = require('babel-core');

const aliases = {
  constants: 'constants-browserify',
  crypto: 'crypto-browserify',
  dns: 'node-libs-browser/mock/dns',
  domain: 'domain-browser',
  fs: 'node-libs-browser/mock/empty',
  http: 'http-browserify',
  https: 'https-browserify',
  net: 'node-libs-browser/mock/net',
  os: 'os-browserify/browser',
  path: 'path-browserify',
  querystring: 'querystring-es3',
  stream: 'stream-browserify',
  _stream_duplex: 'readable-stream/duplex',
  _stream_passthrough: 'readable-stream/passthrough',
  _stream_readable: 'readable-stream/readable',
  _stream_transform: 'readable-stream/transform',
  _stream_writable: 'readable-stream/writable',
  sys: 'util',
  timers: 'timers-browserify',
  tls: 'node-libs-browser/mock/tls',
  tty: 'tty-browserify',
  vm: 'vm-browserify',
  zlib: 'browserify-zlib',

  // The 'ws' library imports these native-backed libs, but we don't
  // really need them.
  'bufferutil': 'node-libs-browser/mock/empty',
  'utf-8-validate': 'node-libs-browser/mock/empty',

  // We don't need node-fetch in the app because React Native provides
  // a fetch implementation. However, the packager sees the require(,
  // so avoid trying to include node-fetch in the app bundle.
  'node-fetch': 'node-libs-browser/mock/empty',

  // This makes silk-rtc magically work in the app, by rewriting
  // its import of 'node-webrtc'.
  'node-webrtc': 'react-native-webrtc',
};

const rootDir = path.resolve(__dirname, '..');

const babelRC = {
  presets: [require('babel-preset-react-native')],
  plugins: [
    [require('babel-plugin-rewrite-require'), {
      aliases: aliases,
      throwForMissingFiles: [
        path.join(rootDir, 'config.local.json'),
        path.join(rootDir, 'raygun', 'config.internal.json'),
      ],
      throwForNonStringLiteral: true,
    }],
  ],
};

if (process.env.CONFIGURATION === 'Release') {
  babelRC.plugins.push(require('./remove-logging'));
} else {
  babelRC.plugins.push(require('./assert-messages'));
}

/**
 * Given a filename and options, build a Babel
 * config object with the appropriate plugins.
 */
function buildBabelConfig(filename) {
  return Object.assign({}, babelRC, {
    filename,
    sourceFileName: filename,
  });
}

function transform(src, filename, options) {
  const babelConfig = buildBabelConfig(filename);
  const result = babel.transform(src, babelConfig);

  return {
    ast: result.ast,
    code: result.code,
    map: result.map,
    filename: filename,
  };
}

// eslint-disable-next-line no-console
console.log('Using silk-react-native-transformer');
module.exports = function(data, callback) {
  let result;
  try {
    result = transform(data.sourceCode, data.filename, data.options);
  } catch (e) {
    callback(e);
    return;
  }

  callback(null, result);
};
