// NOTE: We only try to make this work under node >= 4
const fs = require('fs');

if (fs.existsSync('./build/index.js')) {
  module.exports = require('./build');
} else {
  // NOTE: This means you must use a babel-register invoke somewhere ...
  module.exports = require('./src');
}
