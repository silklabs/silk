/**
 * Simple wrapper around json parsing middleware.
 */


import bodyParser from 'body-parser';
import crypto from 'crypto';

let middleware = bodyParser.json({
  // Somewhat arbitrary but should be plenty of space for any json operations.
  limit: '8kb',

  // As part of nearly all operations we rely on hashing the body to validate
  // that the request was not tampered with we use this value and compare it
  // against a signed signature.
  verify: (req, res, buf) => {
    // sha1 was chosen since it was fast we are not trying to obscure data
    // simplify verify it against a signed signature which contains the hash.
    req.bodyHash = crypto.createHash('sha256').update(buf).digest('hex');
  }
});

export default middleware;
