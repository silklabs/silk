/**
 * This file contains information about the 'dev' account. This is an
 * account shared internally by our company. This _must_ be removed prior to
 * going to production. We intentionally store the email, password,
 * public and private keys (i.e. no security) in the api for ease of use.
 */


/**
 * This information was generated via ./bin/gen-account in server.
 */
let account = {
  'email': 'engineering@silklabs.com',
  'password': 'silklabs',
  'passwordHash': 'fed892d4c48cb16af5f1fb33754a81be59809518046a7990208c6a61e4b731b8',
  'publicKey': '034fb3096bb15ab4bde7c3bb2eaa82fe3d272ce631e068212e221ab2b6b755f12e',
  'privateKey': '074ab271b1d8d4bed0f523e4864f2792f25147fcfb5101bdc4b06f9f79e8a1cd'
};

export default account;
