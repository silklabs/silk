/**
 * Composite table client ...
 *
 * A higher level table client which takes N TableClients and abstracts the
 * process of writing to all of them (blocking writes only on the first
 * composite client.
 *
 * NOTE: It's important to note that consistency of state is not preserved in
 * this process. The secondary table writers can easily fail and it will not
 * throw exceptions.
 *
 * @flow
 */
import invariant from 'assert';
import type {
  TableClient,
  Entity,
  CorsRule,
} from './table';

import createLog from 'silk-log';

const log = createLog('azure-composite-table');

type Consistency = 'first' | 'all';

/**
 * Primary helper for invoking N clients (blocking only on the first client).
 *
 * NOTE: That this function more or less breaks flow checks so the composite
 * class needs to be careful to advertise what it does correctly.
 */
function runTableMutation(
  method: string,
  cons: Consistency,
  clients: Array<TableClient>,
  args: Array<mixed>,
): Promise<any> {
  invariant(clients.length > 0);

  // Clone clients so they can safely be replaced during runtime ...
  clients = clients.concat();

  // List of promises for _all_ operations ...
  let operations = clients.map((client) => {
    // $FlowFixMe: Cannot dynamically call functions so ignore flow error...
    return client[method].apply(client, args);
  });

  if (cons === 'all') {
    return Promise.all(operations);
  }

  let primary = operations.shift();

  // While the primary operation indicates pass/fail the secondary operations
  // will log upon errors ...
  operations.forEach((promise) => {
    promise.catch((err) => {
      log.warn(`Failed secondary operation: ${method} (${err.stack})`);
    });
  });

  return primary;
}

/**
 * Semi nasty hooks to allow dynamically updating the clients under the hood (in
 * the case of a SAS token expiration).
 *
 * NOTE: ES7 decorators would have make this way nicer but are unavailable in
 * babel6 by default ...
 */
function ensureClients(fn) {
  return async function(...args) {
    if (!this._validateClients()) {
      await this._updateClients();
    }
    return fn.apply(this, args);
  };
}

export default class CompositeTableClient {
  _table: string;
  _clients: Array<TableClient>;

  /**
   * NOTE: that all clients must write to the same table name which means
   * each client must belong to a different account (which may or may not be in
   * the same region).
   */
  constructor(
    table: string,
    clients: Array<TableClient>
  ) {
    this._table = table;
    this._clients = clients;
  }

  /**
   * HOOK for subclass to use to validate clients...
   */
  _validateClients(): boolean {
    return true;
  }

  /**
   * HOOK for subclass to use to update the underlying list of clients...
   */
  async _updateClients(): Promise<void> {}

  setCorsRules: (rules: Array<CorsRule>) => Promise<void> =
    ensureClients((rules: Array<CorsRule>) : Promise<void> => {
      return runTableMutation('setCorsRules', 'all', this._clients, [rules]);
    }
  );

  /**
   * Ensure tables are present for writing. This should happen on the server
   * side whenever we add new tables or change client configuration.
   *
   * NOTE: Will block until tables have been created on _all_ clients.
   */
  ensureTables: () => Promise<void> = ensureClients((): Promise<void> => {
    return runTableMutation('createTable', 'all', this._clients, [this._table]);
  });

  /**
   * Destroy all the tables associated with the composite client. This will
   * destroy all data associated with the tables!.
   *
   * NOTE: Will block until tables have been created on _all_ clients.
   */
  destroyTables: () => Promise<void> = ensureClients((): Promise<void> => {
    return runTableMutation('deleteTable', 'all', this._clients, [this._table]);
  });

  /**
   * Merge or insert an entity into the database.
   *
   * NOTE: This is unsuitable for "deletes" which occur by passing the absence
   * of a property. Missing properties will not be removed via mergeOrInsertEntity and
   * will simply continue to exist with their previous state.
   */
  mergeOrInsertEntity: (entity: Entity) => Promise<Entity> =
    ensureClients((entity: Entity): Promise<Entity> => {
      return runTableMutation(
        'mergeOrInsertEntity',
        'first',
        this._clients,
        [this._table, entity],
      );
    });

  /**
   * NOTE: Entity deletes are done using 'If-Match': * meaning this will delete
   * the entity regardless of what state it is in.
   */
  deleteEntity: (entity: Entity) => Promise<void> =
    ensureClients((entity: Entity): Promise<void> => {
      return runTableMutation(
        'deleteEntity',
        'first',
        this._clients,
        [this._table, entity],
      );
    });

  /**
   * Get a single entity by RowKey and PartitionKey.
   */
  getEntity: (entity: Entity) => Promise<Entity> =
    ensureClients((entity: Entity): Promise<Entity> => {
    // TODO: Implement get fallback options ...
    // https://github.com/silklabs/silk-core/issues/1009
      return this._clients[0].getEntity(this._table, entity);
    });

  query: (
    filter: any,
    limit?: number,
    select?: Array<string>
  ) => Promise<Array<Entity>> = ensureClients((filter, limit, select) => {
    // TODO: Implement get fallback options ...
    // https://github.com/silklabs/silk-core/issues/1009
    return this._clients[0].query(
      this._table,
      filter,
      limit,
      select
    );
  });

}
