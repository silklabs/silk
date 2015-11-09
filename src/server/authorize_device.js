/* @flow */
/**
 * Middleware to authorize devices.
 */

import jwtMiddleware from './jwt';
import createLog from 'log';

import type Devices from './models/devices';
import type Nonce from './models/nonce';
import type { MiddlewareFn } from './express_types';

const log = createLog('authorize:device');

export type AuthorizeDeviceConfig = {
  devices: Devices;
  nonce: Nonce;
}

export default function (ctx: AuthorizeDeviceConfig): MiddlewareFn {
  const method = async (publicKey: string, req: any): Promise<?string> => {
    let device = await ctx.devices.findByPublicKey({
      publicKey
    });

    if (!device || device .error) {
      log.info(`Unauthorized public key at ${req.url}`, publicKey);
      return null;
    }

    req.device = device ;
    req.publicKey = publicKey;
    return publicKey;
  };

  return jwtMiddleware(ctx.nonce, method);
}
