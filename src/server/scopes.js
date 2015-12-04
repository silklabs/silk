/**
 * This module deals with figuring out what specific scopes a given account or
 * device may have.
 *
 * Currently we only have one type of scope which is hard coded to "admin" in
 * production email addreses at silk.io and silklabs.com are admins.
 *
 * @flow
 */

import type {Record as AccountRecord} from './models/accounts';

type ScopesMap = {[key: string]: Array<string>};

export default class Scopes {

  _scopeRules: ScopesMap = [];

  constructor(scopeRules: ScopesMap) {
    this._scopeRules = scopeRules;
  }

  /**
   * Figure out what scopes the account has...
   */
  accountScopes(account: AccountRecord): Array<string> {
    let {email} = account;
    email = email.toLowerCase();

    let scopes = [];

    for (let scope in this._scopeRules) {
      let suffixes = this._scopeRules[scope];
      let matches = suffixes.some((suffix) => {
        return email.toLowerCase().endsWith(suffix.toLowerCase());
      });

      if (matches) {
        scopes.push(scope);
      }
    }
    return scopes;
  }

}
