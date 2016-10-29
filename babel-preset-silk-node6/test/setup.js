require('babel-register')({
  only: [
    'test/fixtures/import.js',
    'test/mocha_test.js',
  ],
  presets: [require('..')]
});
