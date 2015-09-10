import base64url from 'base64url';
import Joi from 'joi';

const MUTATE_OUT = Joi.object().keys({
  headers: Joi.object().required(),
  body: Joi.object().required(),
  sig: Joi.any().required(),
}).required();

export default function (token, mutateFn) {
  // Reminder of the JWT format:
  //
  // base64url(headers).base64url(body).<body signature>
  // ^^^^^unsigned^^^^^.^^^^^signed^^^^.^^^^signature^^^

  let parts = token.split('.');

  let inHeaders = JSON.parse(base64url.decode(parts[0]));
  let inBody = JSON.parse(base64url.decode(parts[1]));
  let inSig = parts[2];

  // The way this works is we pass header, body, signature in and expect the
  // mutating func to return them back... We then reconstruct the JWT from that
  // output.
  let out = mutateFn(inHeaders, inBody, inSig);
  Joi.assert(out, MUTATE_OUT);
  let { headers, body, sig } = out;

  return [
    base64url(JSON.stringify(headers)),
    base64url(JSON.stringify(body)),
    sig
  ].join('.');
}
