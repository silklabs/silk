/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import api from '../api';
import assert from 'assert';
import createLog from '../log';

import Operation from './operation';

const log = createLog('outbox:api_call_operation');

export default class APICallOperation extends Operation {
  static NAME = 'api-call-operation';
  static REQUIRES_BLOB = false;

  endpoint = null;
  args = null;

  constructor(options = {}) {
    super();
    Object.assign(this, options);
  }

  _getMetadata() {
    return {
      endpoint: this.endpoint,
      args: this.args,
    };
  }

  async _write() {
    let callable = api;
    this.endpoint.split('.').forEach(segment => {
      callable = callable && callable[segment];
    });
    if (!callable) {
      log.error('Could not resolve API endpoint', this.endpoint);
      return;
    }
    try {
      await callable(...this.args);
      return { done: true };
    } catch (err) {
      return { done: false, error: err };
    }
  }
}
