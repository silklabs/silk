/* @noflow */
module.exports = {
  rules: {
    'no-extraneous-dependencies': require('./no-extraneous-dependencies'),
  },
  configs: {
    recommended: {
      rules: {
        'silk/no-extraneous-dependencies': ['error', {
          allowSelf: true,
          devDependencies: [
            'test/**/*.js',
            'tools/**/*.js',
            'bin/**/*.js',
            '**/webpack.config.js',
          ],
          optionalDependencies: true,
          peerDependencies: true,
          symlinkDependencies: true,
        }],
      },
    },
  },
};
