/**
 * Middleware to authorize devices.
 * @flow
 */

import jwtMiddleware from './jwt';
import createLog from 'silk-log';

import type Devices from './models/devices';
import type Nonce from './models/nonce';
import type { MiddlewareFn } from './express_types';
import type { MiddlewareOverrides } from './jwt';

const log = createLog('authorize:device');

export type AuthorizeDeviceConfig = {
  devices: Devices;
  nonce: Nonce;
}

export default function (ctx: AuthorizeDeviceConfig, options: ?MiddlewareOverrides): MiddlewareFn {
  const method = async (publicKey: string, req: any): Promise<?string> => {
    let device = await ctx.devices.findByPublicKey({
      publicKey,
    });

    if (!device) {
      log.warn(`${req.url}: Unauthorized device '${publicKey}'`);
      return null;
    }

    if (device.error) {
      log.error(`${req.url}: Device '${publicKey}' has an error: ` +
                `${device.error}`);
      return null;
    }

    if (!device.registered) {
      log.warn(`${req.url}: Device '${publicKey}' is no longer registered`);
      return null;
    }

    req.device = device;
    req.publicKey = publicKey;
    return publicKey;
  };

  let config = Object.assign(
    {},
    options,
    { nonce: ctx.nonce, publicKeyProvider: method }
  );

  return jwtMiddleware(config);
}
