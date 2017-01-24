'use strict';

try {
  module.exports = require('./dist/index.json');
} catch (ex) {
  module.exports = require('./gen')();
}
