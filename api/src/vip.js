/**
 * Wrapper around auto generated auth lib to provide cross platform
 * hashing/etc..
 *
 * @flow
 */

import VIPBase from './gen/vip';
import { genPBKDF2KeyDerivation } from 'silk-crypto';

import type {
  CreateAccountInput,
  CreateAccountOutput,
  CheckPasswordInput,
  CheckPasswordOutput,
  SignInInput,
  SignInOutput,
} from './gen/vip';

export type RawPasswordInput = {
 email: string;
 password: string;
 userAgent: string;
};

export type HashedPasswordInput = {
 email: string;
 passwordHash: string;
 userAgent: string;
};

const PBKDF2_ROUNDS = 64000; // (recommendation from 2009)

function genFromPassword(
  payload: RawPasswordInput
): Promise<HashedPasswordInput> {
  if (!payload.password) {
    throw new Error('Password is required');
  }

  if (!payload.email) {
    throw new Error('Email is required');
  }

  // Domain names are case insensitive!
  const email = payload.email.toLowerCase().trim();
  const {password, ...rest} = payload;
  return genPBKDF2KeyDerivation(
    password, /* input */
    email, /* salt */
    PBKDF2_ROUNDS
  ).then((passwordHash) => {
    return {passwordHash, ...rest};
  });
}

/**
 * Wrapper for the underlying createAccount functionality which expects a
 * passwordHash to be generated.
 */
export default class Auth extends VIPBase {

  createAccount: (payload: CreateAccountInput) => Promise<CreateAccountOutput>
    = this.createAccount.bind(this);
  checkPassword: (payload: CheckPasswordInput) => Promise<CheckPasswordOutput>
    = this.checkPassword.bind(this);
  signIn: (payload: SignInInput) => Promise<SignInOutput>
    = this.signIn.bind(this);

  createAccountWithPassword(payload: RawPasswordInput): any {
    return genFromPassword(payload).then(this.createAccount);
  }

  checkPasswordWithPassword(payload: RawPasswordInput): any {
    return genFromPassword(payload).then(this.checkPassword);
  }

  signInWithPassword(payload: RawPasswordInput): any {
    return genFromPassword(payload).then(this.signIn);
  }

}
