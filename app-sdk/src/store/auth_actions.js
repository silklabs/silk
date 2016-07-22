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
import {AsyncStorage, NativeModules} from 'react-native';
import {AccessToken} from 'silk-api';

import {actionFromAsyncPayloadGen} from './action';

import type {SilkApi} from 'silk-api';
import type {RawPasswordInput} from 'silk-api/src/vip';
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
): Promise<boolean> {
  const {success, beaconUUID} = apiResult;
  if (!success) {
    api.accessToken = null;
    return Promise.resolve(false);
  }
  api.metrics.start();
  const {accessToken} = api;
  invariant(accessToken);
  const json = JSON.stringify({
    publicKey: accessToken.pub,
    privateKey: accessToken.priv,
  });
  return AsyncStorage.setItem(ACCESS_TOKEN_KEY, json).then(() => {
    // TODO: enable this once we have the BLE code in the SDK:
    if (NativeModules.BLESocketManager) {
      NativeModules.BLESocketManager.addBeaconUuid(beaconUUID);
    }
    return true;
  });
}

function genRestore(state: StateWithApi): Promise<boolean> {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY).then((accessTokenString) => {
    if (!accessTokenString) {
      return false;
    }
    const {api} = state;
    invariant(api);
    const parsed = JSON.parse(accessTokenString);
    api.accessToken = new AccessToken(parsed.publicKey, parsed.privateKey);
    return true;
  });
}

async function genSignIn(
  state: StateWithApi,
  input: RawPasswordInput
): Promise<boolean> {
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

async function genCreateAccount(
  state: StateWithApi,
  input: RawPasswordInput
): Promise<boolean> {
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
export const signIn = actionFromAsyncPayloadGen('AUTH_SIGNIN', genSignIn);
export const createAccount = actionFromAsyncPayloadGen('AUTH_CREATEACCOUNT', genCreateAccount);
export const signOut = actionFromAsyncPayloadGen('AUTH_SIGNOUT', genSignOut);
