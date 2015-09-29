/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import Operation from './operation';

import api from '../api';
import fs from 'mz/fs';
import createLog from '../log';
import eventToPromise from 'event-to-promise';
import httpStream from '../streams/http';
import assert from 'assert';

const CONTENT_TYPE = 'text/plain';
const log = createLog('operation:crash_report_operation');

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

  /**
   * Unlike most operations this accepts a _path_ to a file on disk so we can
   * avoid buffering the contents into memory...
   */
  async _write(path) {
    // backwards compatibility if we are asked to write a stream.
    if (typeof path === 'object') {
      log.warn(`Uploading old crash report (stream given)`, path);
      path = path.path;
    }

    assert(typeof path === 'string', 'crash reporter only accepts paths');

    let putUrl;
    try {
      putUrl = await api.blob.getPutUrl(
        'crashreport',
        this.size,
        CONTENT_TYPE
      );
    } catch (err) {
      log.error('Failed to get put url for crash report', err);
      return { done: false, remainder: path, error: err };
    }

    let writer = httpStream(putUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': this.size,
        'Content-Type': CONTENT_TYPE
      }
    });

    // TODO: https://github.com/silklabs/silk-device/issues/760
    let readable = fs.createReadStream(path);
    let failErr;

    writer.on('error', (err) => {
      failErr = err;
      log.error('Failed to put blob for crash report', err);
    });
    readable.pipe(writer);
    await eventToPromise(writer, 'close');

    if (failErr) {
      return { done: false, remainder: path, error: failErr };
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
