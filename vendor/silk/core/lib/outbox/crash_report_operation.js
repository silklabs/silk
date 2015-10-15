/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import StreamOperation from './stream_operation';

import api from '../api';
import fs from 'mz/fs';
import createLog from '../log';
import httpStream from '../streams/http';
import assert from 'assert';

const CONTENT_TYPE = 'text/plain';
const log = createLog('operation:crash_report_operation');

export default class CrashReportOperation extends StreamOperation {
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

  async _getDestination() {
    let putUrl = await api.blob.getPutUrl(
      'crashreport',
      this.size,
      CONTENT_TYPE
    );

    let writer = httpStream(putUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': this.size,
        'Content-Type': CONTENT_TYPE
      }
    });
    writer.putUrl = putUrl;
    return writer;
  }

  /**
   * Unlike most operations this accepts a _path_ to a file on disk so we can
   * avoid buffering the contents into memory...
   */
  async _write(path) {
    assert(typeof path === 'string', 'crash reporter only accepts paths');
    let result = await super._write(path);
    if (!result.done) {
      return result;
    }

    let { putUrl } = this.destination;
    try {
      let url = await api.blob.ack(putUrl);
      await api.crashMeta.put(Object.assign(
        {},
        this.metadata,
        { url }
      ));
    } catch (err) {
      log.error(`Failed to upload crash metadata`, err);
      return { done: false, remainder: path, error: err };
    }

    try {
      await fs.unlink(path);
    } catch (err) {
      log.error(`
        Failed to unlink underlying crash report at ${path}.

        This will result in the crash being uploaded multiple times.

        ${err.stack}
      `);
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
