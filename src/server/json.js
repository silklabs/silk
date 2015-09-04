/**
 * Simple wrapper around json parsing middleware.
 */


import bodyParser from 'body-parser';
import crypto from 'crypto';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Construct a hash of the request looks like this:
 *
 * (Minimal version of: http://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html)
 *
 * CanonicalRequest =
 *  $path\n
 *  Lowercase($method)\n
 *  HexEncode(Sha256($body))
 *
 *  StringToSign =
 *    SHA256($CanonicalRequest)
 *
 */
function requestHash(req, buf) {
  // XXX: Should we sign headers as well?
  let body = sha256(buf);
  let canonicalReq = `${req.path}\n${req.method.toLowerCase()}\n${body}`;
  return sha256(canonicalReq);
}

let middleware = bodyParser.json({
  // Somewhat arbitrary but should be plenty of space for any json operations.
  limit: '8kb',

  // As part of nearly all operations we rely on hashing the body to validate
  // that the request was not tampered with we use this value and compare it
  // against a signed signature.
  verify: (req, res, buf) => {
    req.requestHash = requestHash(req, buf);
  }
});

export default middleware;
