const blacklist = require('react-native/packager/blacklist');
const path = require('path');

const ignoreDirectories = [
  'app',
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
  .map((dir) => new RegExp('^' + path.resolve(__dirname, '..', dir) + '/.*'));

module.exports = {
  getProjectRoots() {
    return [__dirname, path.resolve(__dirname, '..')];
  },

  getAssetRoots() {
    return [__dirname];
  },

  getBlacklistRE(platform) {
    return blacklist(platform, additionalBlacklist);
  },
};
