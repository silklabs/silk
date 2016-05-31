const blacklist = require('react-native/packager/blacklist');
const path = require('path');

const additionalBlacklist = [
  /bsp-gonk\/.*/,
  /device\/.*/,
  /external-.*/,
  // TODO uniquify this from svm/models/
  /svm\/.*/,
  /releng\/.*/,
  /tools\/heroku\/.*/,
];

module.exports = {
  getProjectRoots() {
    return [__dirname, path.resolve(__dirname, '..')];
  },

  getAssetRoots() {
    return [__dirname];
  },

  getBlacklistRE(platform) {
    return blacklist(platform, additionalBlacklist);
  }
};
