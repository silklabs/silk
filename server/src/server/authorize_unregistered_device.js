/**
 * Middleware to authorize unregistered devices.
 * @flow
 */

import jwtMiddleware from './jwt';
import createLog from 'silk-log';

import type {AuthorizeDeviceConfig} from './authorize_device';
import type {MiddlewareFn} from './express_types';
import type {MiddlewareOverrides} from './jwt';

const log = createLog('authorize:unregistered_device');

export default function (
  ctx: AuthorizeDeviceConfig,
  options?: MiddlewareOverrides,
): MiddlewareFn {
  const method = async (publicKey: string, req: any): Promise<?string> => {
    const device = await ctx.devices.findByPublicKey(publicKey);
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
      log.debug(`${req.url}: Device '${publicKey}' is no longer registered`);
    }

    req.device = device;
    req.publicKey = publicKey;
    return publicKey;
  };

  let config = Object.assign(
    {},
    options,
    { publicKeyProvider: method }
  );

  return jwtMiddleware(config);
}
