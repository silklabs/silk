if (typeof fetch === 'function') {
  module.exports = fetch; //eslint-disable-line
  module.exports.Headers = Headers;
} else {
  module.exports = require('node-fetch');
}
