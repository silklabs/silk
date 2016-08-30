/**
 * Authentication actions
 *
 * Unfortunately due to the way that silk-api works, these actions
 * have side-effects. Namely, the API's accessToken property gets
 * mutated as we attempt to restore credentials from disk or sign in.
 *
 * @flow
 */
import invariant from 'assert';
import {AsyncStorage} from 'react-native';
import {AccessToken} from 'silk-api';
import {
  actionFromPayload,
  actionFromAsyncPayloadGen,
} from 'silk-redux/action';

import type {SilkApi} from 'silk-api';
import type {RawPasswordInput, SignInWithTokenInput} from 'silk-api/src/vip';
import type {
  SignInOutput,
  CreateAccountOutput,
  ResetPasswordInput,
} from 'silk-api/src/gen/vip';

import type {StateWithApi} from './api';

const ACCESS_TOKEN_KEY = 'user.accessToken';
const REGISTERED_DEVICES_KEY = 'user.registeredDevices';

// Payload generators

function genHandleSuccessfulAuth(
  api: SilkApi,
  apiResult: SignInOutput | CreateAccountOutput
): Promise<?string> {
  const {success, beaconUUID, userId} = apiResult;
  if (!success) {
    api.accessToken = null;
    return Promise.resolve(null);
  }
  api.metrics.start();
  const {accessToken} = api;
  invariant(accessToken);
  const json = JSON.stringify({
    publicKey: accessToken.pub,
    privateKey: accessToken.priv,
    beaconUuid: beaconUUID,
    userId: userId,
  });
  return AsyncStorage.setItem(ACCESS_TOKEN_KEY, json).then(() => beaconUUID);
}

function genRestore(state: StateWithApi): Promise<?string> {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY).then((accessTokenString) => {
    if (!accessTokenString) {
      return null;
    }
    const {api} = state;
    invariant(api);
    const parsed = JSON.parse(accessTokenString);
    api.accessToken = new AccessToken(parsed.publicKey, parsed.privateKey);
    return parsed.beaconUuid;
  });
}

async function genSignInWithPassword(
  state: StateWithApi,
  input: RawPasswordInput
): Promise<?string> {
  // Always create a new token when we attempt a sign up...
  const {api} = state;
  invariant(api);
  api.accessToken = await AccessToken.gen();
  try {
    const result = await api.vip.signInWithPassword(input);
    return await genHandleSuccessfulAuth(api, result);
  } catch (ex) {
    api.accessToken = null;
    throw ex;
  }
}

async function genSignInWithOAuth2(
    state: StateWithApi,
    input: SignInWithTokenInput
): Promise<?string> {
  // Always create a new token when we attempt a sign up...
  const {api} = state;
  invariant(api);
  api.accessToken = await AccessToken.gen();
  try {
    const result = await api.vip.signInWithOAuth2(input);
    return await genHandleSuccessfulAuth(api, result);
  } catch (ex) {
    api.accessToken = null;
    throw ex;
  }
}

async function genCreateAccount(
  state: StateWithApi,
  input: RawPasswordInput
): Promise<?string> {
  // Always create a new token when we attempt a sign up...
  const {api} = state;
  invariant(api);
  api.accessToken = await AccessToken.gen();
  try {
    const result = await api.vip.createAccountWithPassword(input);
    return await genHandleSuccessfulAuth(api, result);
  } catch (ex) {
    api.accessToken = null;
    throw ex;
  }
}

function genSignOut(
  state: StateWithApi
): Promise<void> {
  const {api} = state;
  invariant(api);
  api.metrics.stop();
  api.accessToken = null;

  return AsyncStorage.multiRemove([
    ACCESS_TOKEN_KEY,
    REGISTERED_DEVICES_KEY,
  ]);
}

async function genResetPassword(
  state: StateWithApi,
  input: ResetPasswordInput
): Promise<boolean> {
  const {api} = state;
  invariant(api);
  try {
    const {success} = await api.vip.resetPassword(input);
    return success;
  } finally {
    this.api.accessToken = null;
  }
}

// ThunkActions

export const restore = actionFromAsyncPayloadGen('AUTH_RESTORE', genRestore);
export const signInWithPassword = actionFromAsyncPayloadGen('AUTH_SIGNIN_WITH_PASSWORD', genSignInWithPassword);
export const signInWithOAuth2 = actionFromAsyncPayloadGen('AUTH_SIGNIN_WITH_TOKEN', genSignInWithOAuth2);
export const createAccount = actionFromAsyncPayloadGen('AUTH_CREATEACCOUNT', genCreateAccount);
export const signOut = actionFromAsyncPayloadGen('AUTH_SIGNOUT', genSignOut);
export const resetPassword = actionFromAsyncPayloadGen('AUTH_RESETPASSWORD', genResetPassword);
// TODO: eventually we actually want to abort the operation here, but
// silk-api doesn't have a hook for that yet.
export const abortOperation = actionFromPayload('AUTH_ABORT_OPERATION');
export const ackError = actionFromPayload('AUTH_ACK_ERROR');
