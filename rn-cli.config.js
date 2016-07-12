/**
 * This file gets require()-ed by the React Native packager
 * and configures how it resolves and transforms modules.
 */
'use strict';

const blacklist = require('react-native/packager/blacklist');
const fs = require('fs');
const path = require('path');

const ignoreDirectories = [
  'bsp-gonk',
  'pub/bsp-gonk',
  'device',
  'external-dlib',
  'external-fast-image-size',
  'external-jade',
  'external-js-kissfft',
  'external-node-kissfft',
  'svm',
  'releng',
  'tools/heroku',
];

const additionalBlacklist = ignoreDirectories
  .map((dir) => new RegExp('^' + path.join(__dirname, dir) + '/.*'));

module.exports = {
  getProjectRoots() {
    return [__dirname];
  },

  getAssetRoots() {
    return [__dirname];
  },

  getBlacklistRE(platform) {
    return blacklist(platform, additionalBlacklist);
  },

  getTransformModulePath() {
    return fs.realpathSync(
      require.resolve('silk-react-native-transformer')
    );
  },
};
