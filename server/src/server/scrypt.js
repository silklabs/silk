/**
 * This is a hack to allow silk-server to be installed by silk-device to run
 * tests/etc... When running from the host but not actually build things like
 * scrypt.
 */

let scrypt;
try {
  scrypt = require('scrypt');
} catch (err) {
  console.warn('Scrypt disabled....');
}

module.exports = scrypt;
