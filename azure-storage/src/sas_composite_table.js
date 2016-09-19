/**
 * This module is a helper around the common operation of updating Sas tokens as
 * they expire and updating the related clients...
 *
 * @flow
 */

import invariant from 'assert';
import createLog from 'silk-log';

import CompositeTable from './composite_table';
import { TableClient, SharedAccessTokenAuth } from './table';

import type { Sas } from './signer/table';

export type SasSignatures = Array<[string, Sas]>;

const log = createLog('azure-sas-composite-table');

export default class SasCompositeTableClient extends CompositeTable {
  _fetcher: () => Promise<SasSignatures>;
  _pendingSasUpdate: ?Promise<void>;

  // We keep the original list of signatures around to check if they are still
  // valid.
  _signatures: ?SasSignatures;

  _setClients(signatures: SasSignatures): void {
    if (signatures.length < 1) {
      throw new Error(`Invalid number of sas clients (${signatures.length})`);
    }

    log.info('setting %s clients', signatures.length);
    this._signatures = signatures;
    this._clients = signatures.map((authConfig) => {
      let [host, sas] = authConfig;
      // Set the table if it has not yet been set ...
      if (!this._table) {
        invariant(sas.tn);
        this._table = sas.tn;
      }

      let auth = new SharedAccessTokenAuth(host, sas);
      return new TableClient(auth);
    });
  }

  _updateClients(): Promise<void> {
    if (this._pendingSasUpdate) {
      log.info('Waiting for sas update ...');
      invariant(this._pendingSasUpdate);
      return this._pendingSasUpdate;
    }

    log.info('Issuing sas update ...');

    this._pendingSasUpdate = this._fetcher().
      then((result) => {
        invariant(Array.isArray(result));
        this._pendingSasUpdate = null;
        this._setClients(result);
        return;
      }).
      catch((err) => {
        this._pendingSasUpdate = null;
        throw err;
      });

    return this._pendingSasUpdate;
  }

  _validateClients(): boolean {
    // If we don't have any clients yet we need to issue a fetch.
    if (!this._table || !this._clients.length || !this._signatures) {
      log.verbose('Fetching initial sas tokens ...');
      return false;
    }

    invariant(Array.isArray(this._signatures));
    for (let signature of this._signatures) {
      let [, sas] = signature;
      invariant(sas.se);
      let expiration = new Date(sas.se);

      // If any of the Sas tokens we have are expired fetch new ones...
      if (expiration < Date.now()) {
        log.info('Expired sas token. Fetching new ones.');
        return false;
      }
    }

    log.verbose('Sas Tokens still valid ....');
    return true;
  }

  constructor(fetcher: () => Promise<SasSignatures>) {
    // Blank table is given.. It will be assigned later when we get the SAS
    // tokens.
    super('', []);
    this._fetcher = fetcher;
    // Kick off an initial Sas fetch to make the initial request time faster.
    this._updateClients();
  }

}
