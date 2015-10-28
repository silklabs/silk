#! /usr/bin/env node

/**
 * In our clients we sometimes need to provide build time overrides in our
 * configs. This is particularly useful for changing our server url for various
 * staging/production environments.
 */

var SERVER_ENV = process.env.TRAVIS_BRANCH || 'master';

var config = {
  serverUrl: 'https://silk-server-' + SERVER_ENV + '.herokuapp.com'
};

process.stdout.write(JSON.stringify(config, null, 2));
