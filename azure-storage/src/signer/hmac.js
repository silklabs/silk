/* @flow */
import invariant from 'assert';
import crypto from 'crypto';

/**
 * Azure verifies much of what we send it by checking the input vs a signed version of the input.
 *
 * The value is signed with a sha256 algorithm and the key is the base64 decoded value of access key.
 */
export default function hmac(accessKey: string, value: Buffer | string): string {
  // start by decoding the access key
  const decodedKey = new Buffer(accessKey, 'base64');

  // encrypt the value and encode it with base64
  let hmac = crypto.createHmac('sha256', decodedKey);
  hmac.update(value);
  let result = hmac.digest('base64');
  invariant(result);
  return result;
}
