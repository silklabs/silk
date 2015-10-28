/**
 * Wrapper around auto generated auth lib to provide cross platform
 * hashing/etc..
 */

import VIPBase from './gen/vip';
import pbkdf2 from 'pbkdf2';

export default class Auth extends VIPBase {

  hashPassword(email, password) {
    // Domain names are case insensitive!
    email = email.toLowerCase().trim();

    return pbkdf2.pbkdf2Sync(
      password, // key
      email, // salt
      64000, // rounds (recommendation from 2009)
      32, // key length
      'sha256' // hash algorithm
    ).toString('hex');
  }

  fromPassword(payload) {
    if (!payload.password) {
      throw new Error('Password is required');
    }

    if (!payload.email) {
      throw new Error('Email is required');
    }

    // Do not mutate old payload...
    let newPayload = Object.assign({}, payload);
    newPayload.passwordHash = this.hashPassword(payload.email, payload.password);

    delete newPayload.password;
    return newPayload;
  }

  /**
   * Wrapper for the underlying createAccount functionality which expects a
   * passwordHash to be generated.
   */
  createAccountWithPassword(payload) {
    return this.createAccount(this.fromPassword(payload));
  }

  checkPasswordWithPassword(payload) {
    return this.checkPassword(this.fromPassword(payload));
  }

  signInWithPassword(payload) {
    return this.signIn(this.fromPassword(payload));
  }

}
