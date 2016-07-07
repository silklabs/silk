/**
 * This module maintains the state of the server within azure table.
 *
 * XXX: This module assumes that a single server state instance will be run for
 * each given host.
 *
 * @flow
 */
import invariant from 'assert';
import createLog from 'silk-log';
import sha256 from 'silk-utils/sha256';

import type CompositeTable from 'silk-azure-storage/src/composite_table';

const log = createLog('server:signaling:server_state');

export type ServerEntity = {
  PartitionKey: string;
  RowKey: string;
  host: string;
  lastCheck: number;
};

export type Config = {
  checkIntervalMs: number;
};

export default class ServerState {
  _table: CompositeTable;
  _host: string;
  _state: ServerEntity;
  _config: Config;

  _pendingUpdate: ?Promise<void>;
  _timer: ?number = null;

  constructor(host: string, table: CompositeTable, config: Config) {
    this._host = host;
    this._table = table;
    this._config = config;

    const hash = sha256(host);
    this._state = {
      PartitionKey: hash,
      RowKey: hash,
      host,
      lastCheck: Date.now(),
    };
  }

  _setUpdateTimer() {
    invariant(this._timer === null);
    this._timer = setTimeout(this._onIntervalCheck, this._config.checkIntervalMs);
  }

  _runUpdate: () => Promise<void> = () => {
    log.info(`Updating lastCheck time for host; ${this._state.host}`);
    const state = this._state = Object.assign({}, this._state, {
      lastCheck: Date.now(),
    });
    return this._table.mergeOrInsertEntity(state);
  };

  _onIntervalCheck: () => Promise<void> = async () => {
    log.info(`_onIntervalCheck`);
    this._timer = null;

    this._pendingUpdate = this._runUpdate();
    try {
      await this._pendingUpdate;
    } catch (err) {
      log.error(`Interval update has failed for server`, err.stack);
    } finally {
      this._pendingUpdate = null;
      this._setUpdateTimer();
    }
  };

  _onBeforeExit: () => Promise<void> = async () => {
    log.info('_onBeforeExit');
    await this.stop();
  };

  /**
   * Register the server and start updating it's status within azure table.
   */
  async start(): Promise<void> {
    log.info('start', this._state.host);
    await this._runUpdate();
    this._setUpdateTimer();
  }

  async stop(): Promise<void> {
    log.info('stop', this._state.host);
    clearTimeout(this._timer);
    // If we attempt to delete the record while performing the merge the result
    // will be indeterminate Since we are the only writers of this entity we
    // can simply wait for our other pending operation to finish.
    if (this._pendingUpdate) {
      await this._pendingUpdate;
    }

    const deleteEntity = Object.assign({}, this._state, {
      ETag: '*',
    });
    await this._table.deleteEntity(deleteEntity);
  }
}
