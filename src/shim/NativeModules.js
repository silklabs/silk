import sjcl from 'sjcl';
sjcl.random.startCollectors();

export const AppCrypto = {
  getRandomBytes(numberOfBytes, callback) {
    let bytes = new Uint8Array(numberOfBytes);
    window.crypto.getRandomValues(bytes);
    callback(bytes);
  },
  PBKDF2KeyDerivation(input, salt, rounds, callback) {
    let output = sjcl.misc.pbkdf2(input, salt, rounds);
    callback(sjcl.codec.hex.fromBits(output));
  },
};
