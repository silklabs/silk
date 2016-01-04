/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import api from '../api';
import assert from 'assert';

import Operation from './operation';

export default class APICallOperation extends Operation {
  static NAME = 'api-call-operation';
  static REQUIRES_BLOB = false;

  endpoint = null;
  args = null;

  constructor(options = {}) {
    super();
    Object.assign(this, options);

    assert(this.endpoint, 'must provide .endpoint...');
    assert(this.args, 'must provide .args');
  }

  _getMetadata() {
    return {
      endpoint: this.endpoint,
      args: this.args,
    };
  }

  async _write() {
    let callable = api;
    let ctx;
    this.endpoint.split('.').forEach(segment => {
      ctx = callable; // context is always the previous segment.
      callable = callable && callable[segment];
    });

    if (!callable) {
      throw new Error('Could not resolve API endpoint', this.endpoint);
    }

    try {
      await callable.call(ctx, ...this.args);
      return { done: true };
    } catch (err) {
      return { done: false, error: err };
    }
  }
}
