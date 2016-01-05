/**
 * Wrapper around auto generated auth lib to provide cross platform
 * hashing/etc..
 *
 * @flow
 */

import VIPBase from './gen/vip';
import pbkdf2 from 'pbkdf2';

export default class Auth extends VIPBase {

  PBKDF2_ROUNDS: number = 64000; // (recommendation from 2009)

  hashPassword(email: string, password: string): string {
    // Domain names are case insensitive!
    email = email.toLowerCase().trim();

    return pbkdf2.pbkdf2Sync(
      password, // key
      email, // salt
      this.PBKDF2_ROUNDS, // rounds
      32, // key length
      'sha256' // hash algorithm
    ).toString('hex');
  }

  fromPassword(payload: any): any {
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
  createAccountWithPassword(payload: any): any {
    return this.createAccount(this.fromPassword(payload));
  }

  checkPasswordWithPassword(payload: any): any {
    return this.checkPassword(this.fromPassword(payload));
  }

  signInWithPassword(payload: any): any {
    return this.signIn(this.fromPassword(payload));
  }

}
