/**
 * Middleware to authorize accounts.
 * @flow
 */

import jwtMiddleware from './jwt';
import createLog from 'silk-log';

import type Accounts from './models/accounts';
import type { MiddlewareFn } from './express_types';
import type { MiddlewareOverrides } from './jwt';

const log = createLog('authorize:account');

export type AuthorizeAccountConfig = {
  accounts: Accounts;
}

export default function (ctx: AuthorizeAccountConfig, overrides: ?MiddlewareOverrides): MiddlewareFn {
  const method = async (publicKey: string, req: any): Promise<?string> => {
    let account = await ctx.accounts.findByPublicKey(publicKey);

    if (!account) {
      log.warn(`${req.url}: Unauthorized account '${publicKey}'`);
      return null;
    }

    if (account.error) {
      log.error(`${req.url}: Account '${publicKey}' has an error: ` +
                `${account.error}`);
      return null;
    }

    // TODO: Validate the scopes and expiration of the used public key!
    req.account = account;
    req.publicKey = publicKey;
    return publicKey;
  };

  let config = Object.assign(
    {},
    overrides,
    { publicKeyProvider: method }
  );

  return jwtMiddleware(config);
}
