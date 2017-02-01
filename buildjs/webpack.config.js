/* @noflow */
'use strict';

const path = require('path');
const fs = require('fs');
const lookup = require('look-up');

const findPackage = require('./src/find_package.js');

const resolve = require('resolve');
const mkdirp = require('mkdirp');

// We must place our files in a special folder for integration /w the android
// build system.
const destination = process.env.SILK_BUILDJS_DEST;
const modulePath = findPackage(process.env.SILK_BUILDJS_SOURCE);
const pkg = require(path.join(modulePath, 'package.json'));
const localWebpack = path.join(modulePath, 'webpack.config.js');

// Walk up cwd looking for a project-level webpack.config.js
const projectWebpack = lookup(
  'webpack.config.js',
  {cwd: path.resolve(path.dirname(localWebpack), '..')}
);

let babelCache;
if (!process.env.BABEL_CACHE || process.env.BABEL_CACHE === '1') {
  babelCache = path.join(destination, '../.babelcache');
  mkdirp.sync(babelCache);
} else {
  console.log('~ babel cache has been disabled ~');
  babelCache = false;
}

let main = pkg.main || './index.js';
if (!path.extname(main)) {
  main += '.js';
}

if (main.indexOf('./') !== 0) {
  main = `./${main}`;
}

const absMain = path.resolve(modulePath, main);
let mainDir;

try {
  mainDir = fs.realpathSync(path.dirname(absMain));
} catch (err) {
  mainDir = path.dirname(absMain);
}

// XXX: Would be nicer to abort this in the bash script rather than after we
// have booted up node here...
if (
  main.indexOf('build/Release') === 0 ||
  main.indexOf('./build/Release') === 0 ||
  /\.node$/.test(main)
) {
  console.log(`Module contains no JS main skipping webpack ...`);
  process.exit(0);
}

if (!main) {
  throw new Error(`package.json must have main in ${process.cwd()}`);
}

const externals = [
  // TODO: auto generate these ...
  'bleno',
  'lame',
  'mic',
  'noble',
  'node-hid',
  'node-wav',
  'opencv',
  'segfault-handler',
  'silk-alog',
  'silk-audioplayer',
  'silk-battery',
  'silk-bledroid',
  'silk-camera',
  'silk-capture',
  'silk-core-version',
  'silk-gc1',
  'silk-input',
  'silk-lights',
  'silk-log',
  'silk-movie',
  'silk-ntp',
  'silk-properties',
  'silk-sensors',
  'silk-speaker',
  'silk-sysutils',
  'silk-tts',
  'silk-vibrator',
  'silk-volume',
  'silk-wifi',
  'sodium',
  (context, request, callback) => {
    if (resolve.isCore(request)) {
      callback(null, true);
      return;
    }

    // For extra fun node will allow resolving .main without a ./ this behavior
    // makes .main look nicer but is completely different than how requiring
    // without a specific path is handled elsewhere... To ensure we don't
    // accidentally resolve a node module to a local file we handle this case
    // very specifically.
    if (context === modulePath && pkg.main === request) {
      const resolvedPath = path.resolve(context, request);
      if (!fs.existsSync(resolvedPath)) {
        callback(new Error(`${modulePath} has a .main which is missing ...`));
        return;
      }
    }

    // Handle path rewriting for native modules
    if (
      /\.node$/.test(request) ||
      request.indexOf('build/Release') !== -1
    ) {
      if (path.isAbsolute(request)) {
        callback(null, true);
        return;
      }

      const absExternalPath = path.resolve(context, request);
      let relativeExternalPath = path.relative(mainDir, absExternalPath);
      if (relativeExternalPath.indexOf('.') !== 0) {
        relativeExternalPath = `./${relativeExternalPath}`;
      }
      callback(null, relativeExternalPath);
      return;
    }

    resolve(request, {
      basedir: context,
      package: pkg,
      extensions: ['.js', '.json'],
    }, (err, resolvedPath) => {
      if (err) {
        console.log(`Missing module imported from ${context} (${request})`);
        callback(null, true);
        return;
      }
      callback(null, false);
    });
  },
];

const entry = {};
entry[main] = main;

const config = {
  context: modulePath,
  externals,
  target: 'node',
  node: {
    __dirname: false,
    __filename: false,
  },
  devtool: 'source-map',
  entry,
  output: {
    path: path.join(destination),
    libraryTarget: 'commonjs2',
    filename: `[name]`,
  },
  resolve: {
    extensions: ['', '.js', '.json'],
    // Common "gothcha" modules ...
    alias: {
      'any-promise': require.resolve('./shims/any-promise.js'),
      'json3': require.resolve('./shims/json3.js'),
    },
  },
  babel: {
    cacheDirectory: babelCache,
    presets: [
      require('babel-preset-silk-node6'),
    ],
  },
  module: {
    loaders: [
      {test: /\.json$/, loader: require.resolve('json-loader')},
      {
        test: /\.js$/,
        loader: require.resolve('babel-loader'),
        query: {
          babelrc: false,
        },
      },
    ],
  },
};

function applyWebpackConfig(webpackConfig) {
  if (fs.existsSync(webpackConfig)) {
    console.log(`${webpackConfig} found agumenting buildjs ...`);
    const rules = Object.assign({}, require(webpackConfig));
    if (rules.externals && Array.isArray(rules.externals)) {
      // Order is important here the rules should be ordered such that the
      // webpack.config comes from the module first and our global rules second.
      config.externals = rules.externals.concat(config.externals);
      delete rules.externals;
    }
    if (rules.loaders && Array.isArray(rules.loaders)) {
      config.module.loaders = rules.loaders.concat(config.module.loaders);
      delete rules.loaders;
    }
    Object.assign(config, rules);
  }
}
[projectWebpack, localWebpack].map(applyWebpackConfig);

module.exports = config;
