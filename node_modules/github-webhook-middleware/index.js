var bodyParser = require('body-parser');
var crypto = require('crypto');

function signBlob(key, blob) {
  return 'sha1=' + crypto.createHmac('sha1', key).update(blob).digest('hex');
}

module.exports = function(options) {
  if (typeof options != 'object')
    throw new TypeError('must provide an options object');

  if (typeof options.secret != 'string' || options.secret === '')
    throw new TypeError('must provide a \'secret\' option');

  return bodyParser.json({
    verify: function(req, res, buffer) {
      if (!req.headers['x-hub-signature'])
        throw new Error('No X-Hub-Signature found on request');

      if (!req.headers['x-github-event'])
        throw new Error('No X-Github-Event found on request');

      if (!req.headers['x-github-delivery'])
        throw new Error('No X-Github-Delivery found on request');
      
      var received_sig = req.headers['x-hub-signature'];
      var computed_sig = signBlob(options.secret, buffer);

      if (received_sig != computed_sig) {
        console.warn('Recieved an invalid HMAC: calculated:' +
          computed_sig + ' != recieved:' + received_sig);
        throw new Error('Invalid Signature');
      }
    }
  });
};
