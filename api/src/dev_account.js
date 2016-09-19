/**
 * This file contains information about the 'dev' account. This is an
 * account shared internally by our company. This _must_ be removed prior to
 * going to production. We intentionally store the email, password,
 * public and private keys (i.e. no security) in the api for ease of use.
 *
 * @flow
 */


/**
 * This information was generated via ./bin/gen-account in server.
 */
let account = {
  'email': 'engineering@silklabs.com',
  'password': 'silklabs',
  'passwordHash': 'fed892d4c48cb16af5f1fb33754a81be59809518046a7990208c6a61e4b731b8',
  'publicKey': '93a2f81582253c4edbbf6f69ceb2e32870a04614f7e31d5a60d46e4bc8cdcba7',
  'privateKey': '4b066b20312427fbec1e76374d34bff370abb486454cf6f286efb7c526887f3f',
};

export default account;
