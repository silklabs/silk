/**
 * Middleware to authorize accounts.
 * @flow
 */

import jwtMiddleware from './jwt';
import createLog from 'log';

import type Account from './models/accounts';
import type Nonce from './models/nonce';
import type { MiddlewareFn } from './express_types';
import type { MiddlewareOverrides } from './jwt';

const log = createLog('authorize:account');

export type AuthorizeAccountConfig = {
  accounts: Account;
  nonce: Nonce;
}

export default function (ctx: AuthorizeAccountConfig, overrides: ?MiddlewareOverrides): MiddlewareFn {
  const method = async (publicKey: string, req: any): Promise<?string> => {
    let account = await ctx.accounts.findByPublicKey({
      publicKey
    });

    if (!account || account.error) {
      log.info(`Unauthorized public key at ${req.url}`, publicKey);
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
    { nonce: ctx.nonce, publicKeyProvider: method }
  );

  return jwtMiddleware(config);
}
