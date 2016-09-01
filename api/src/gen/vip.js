/**
 * API methods for creating/logging in/authenticating user accounts
 *
 * @flow
 */

import BaseClass from '../http_client';

export type CreateAccountInput = {
 email: string;
 passwordHash: string;
 userAgent: string;
};

export type CreateAccountOutput = {
 success: bool;
 beaconUUID: ?string;
 userId: string;
};

export type SignInInput = {
 email: string;
 passwordHash: string;
 userAgent: string;
};

export type SignInOutput = {
 success: bool;
 beaconUUID: ?string;
 userId: string;
};

export type CheckPasswordInput = {
 email: string;
 passwordHash: string;
};

export type CheckPasswordOutput = {
 success: bool;
};

export type ResetPasswordInput = {
 email: string;
};

export type ResetPasswordOutput = {
 success: bool;
};

export type UsePasswordResetTokenInput = {
 email: string;
 token: string;
 passwordHash: string;
};

export type UsePasswordResetTokenOutput = {
 success: bool;
};

export default class Vip extends BaseClass {

  name: string = 'api-vip';
  prefix: string = '/v1/vip/';

  
  /**
  Create a user account

  @param Object payload of request
  */
  createAccount(payload: CreateAccountInput): Promise<CreateAccountOutput> {
    let method = 'post';
    let url = '/v1/vip/create';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Sign into an account

  @param Object payload of request
  */
  signIn(payload: SignInInput): Promise<SignInOutput> {
    let method = 'post';
    let url = '/v1/vip/sign_in';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Authenticate with an existing account

  @param Object payload of request
  */
  checkPassword(payload: CheckPasswordInput): Promise<CheckPasswordOutput> {
    let method = 'post';
    let url = '/v1/vip/check_passsword';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Trigger a password reset (forgot password)

  @param Object payload of request
  */
  resetPassword(payload: ResetPasswordInput): Promise<ResetPasswordOutput> {
    let method = 'post';
    let url = '/v1/vip/reset_password';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Use the token provided by resetPassword to set a new password

  @param Object payload of request
  */
  usePasswordResetToken(payload: UsePasswordResetTokenInput): Promise<UsePasswordResetTokenOutput> {
    let method = 'post';
    let url = '/v1/vip/use_password_reset_token';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }
}