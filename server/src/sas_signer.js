/**
 * Generic helper which consumes the azure config and can spit out specific
 * SAS signatures.
 *
 * @flow
 */


import invariant from 'assert';
import { sas } from 'silk-azure-storage/src/signer/table';
import parseConnectionString from 'silk-azure-storage/src/connection_string';

import type { Sas } from 'silk-azure-storage/src/signer/table';

type Config = {
  regions: {[key: string]: string},
  tables: {[key: string]: string},
};

type TableSigOptions = {
  expiration: string | Date;
  signedPermissions: string;
  startPartitionKey?: string;
  startRowKey?: string;
  endPartitionKey?: string;
  endRowKey?: string;
};

export default class Signer {

  _config: Config;
  constructor(config: Config) {
    this._config = config;
  }

  createTableSignatures(
    table: string,
    options: TableSigOptions
  ): Array<[string, Sas]> {
    const tableName = this._config.tables[table];
    invariant(tableName);

    let signatures = [];
    for (let region in this._config.regions) {
      const creds = parseConnectionString(this._config.regions[region]);
      signatures.push([creds.account, sas({
        table: tableName,
        account: creds.account,
        accessKey: creds.accessKey,
        ...options,
      })]);
    }

    return signatures;
  }
}
