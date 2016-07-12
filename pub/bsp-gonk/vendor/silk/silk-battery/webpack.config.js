module.exports = {
  resolve: {
    alias: {
      'any-promise': require.resolve('./lib/shims/any-promise.js'),
    },
  },
  externals: [
    'silk-alog',
    'silk-sysutils',
  ],
};
