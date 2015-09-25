/**
 * Copyright (c) 2015 Silk Laboratories, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Laboratories, Inc.
 */

import Operation from './operation';
import StoringStream from '../streams/store';
import TeeStream from '../streams/tee';

import api from '../api';
import createLog from '../log';
import eventToPromise from 'event-to-promise';
import httpStream from '../streams/http';
import assert from 'assert';

const CONTENT_TYPE = 'text/plain';
const log = createLog('operation:crash-report');

export default class CrashReportOperation extends Operation {
  static NAME = 'crash-report';

  metadata = null

  // Size in bytes of stream...
  size = null

  constructor(options = {}) {
    super();
    Object.assign(this, options);

    assert(typeof this.size === 'number', 'must pass numeric size');
    assert(typeof this.metadata === 'object', 'must pass metadata');
  }

  async _write(readable) {
    let putUrl;
    try {
      putUrl = await api.blob.getPutUrl(
        'crashreport',
        this.size,
        CONTENT_TYPE
      );
    } catch (err) {
      log.error('Failed to get put url for crash report', err);
      return { done: false, remainder: readable, error: err };
    }

    let writer = httpStream(putUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': this.size,
        'Content-Type': CONTENT_TYPE
      }
    });

    // TODO: https://github.com/silklabs/silk-device/issues/760
    let store = new StoringStream();
    let tee = new TeeStream(store, writer);

    let failErr;

    writer.on('error', (err) => {
      failErr = err;
      log.error('Failed to put blob for crash report', err);
    });
    readable.pipe(tee);
    await eventToPromise(tee, 'close');

    if (failErr) {
      return { done: false, remainder: store, error: failErr };
    }

    try {
      let url = await api.blob.ack(putUrl);
      await api.crashMeta.put(Object.assign(
        {},
        this.metadata,
        { url }
      ));
    } catch (err) {
      log.error(`Failed to upload crash metadata`, err);
      return { done: false, remainder: store, error: err };
    }

    return { done: true };
  }

  _getMetadata() {
    return {
      size: this.size,
      metadata: this.metadata
    };
  }
}
