var path = require('path');

// Allow including silk-server src and test...
var allowed = [
  path.join(__dirname, '../test'),
  path.join(__dirname, '../src'),
  path.join(__dirname, '../node_modules/silk-server/src'),
  path.join(__dirname, '../node_modules/silk-server/test'),
  path.join(__dirname, '../node_modules/silk-server/config'),
];

require('babel/register')({
  // Ignore everything in node_modules except node_modules/rcomponents.
  ignore: /node_modules\/(?!silk-server)/,
  only: function(file) {

    return allowed.some(function(value) {
      return file.startsWith(value);
    });
  }
});
