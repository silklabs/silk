/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @flow
 */

import invariant from 'assert';
import {AccessToken} from 'silk-api';

import getStore from './store';

let deviceId: ?AccessToken = null;

export default function getDeviceId(): AccessToken {
  if (!deviceId) {
    const {pub, priv} = getStore().getState().persist.accessToken;
    invariant(pub);
    invariant(priv);

    deviceId = new AccessToken(pub, priv);
  }

  return deviceId;
}
