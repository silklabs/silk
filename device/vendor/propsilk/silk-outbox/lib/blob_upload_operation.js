/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @private
 * @noflow
 */

import StreamOperation from './stream_operation';

import api from 'silk-device-api';
import createLog from 'silk-log/device';
import {httpStream} from 'silk-streams';
import assert from 'assert';

const log = createLog('operation:blob_upload_operation');

export class BlobUploadOperation extends StreamOperation {

  metadata = null;
  // Size in bytes of stream...
  size = null;

  constructor(options = {}) {
    super();
    Object.assign(this, options);

    assert(typeof this.size === 'number', 'must pass numeric size');
    assert(typeof this.metadata === 'object', 'must pass metadata');
  }

  async _getDestination() {
    let {putUrl, putHeaders} = await api.blobPublisher.putUrl(
      this.constructor.META_TYPE,
      {
        contentLength: this.size,
        contentType: this.constructor.CONTENT_TYPE,
      }
    );

    let writer = httpStream(putUrl, {
      method: 'PUT',
      headers: putHeaders,
    });

    writer.putUrl = putUrl;
    return writer;
  }

  /**
   * Unlike most operations this accepts a _path_ to a file on disk so we can
   * avoid buffering the contents into memory...
   * @private
   */
  async _write(path) {
    let result = await super._write(path);
    if (!result.done) {
      return result;
    }

    let { putUrl } = this.destination;
    try {
      let { url } = await api.blobPublisher.ack({ url: putUrl });
      await api.metadataPublisher.create(Object.assign(
        {},
        this.metadata,
        { url }
      ));
    } catch (err) {
      log.error(`Failed to upload video metadata`, err);
      return { done: false, remainder: path, error: err };
    }

    return { done: true };
  }

  _getMetadata() {
    return {
      size: this.size,
      metadata: this.metadata,
    };
  }
}

export class PosKeywordUploadOperation extends BlobUploadOperation { // eslint-disable-line
  static NAME = 'keyword-upload';
  static META_TYPE = 'keyword_pos';
  static CONTENT_TYPE = 'audio/wav';
}

export class NegKeywordUploadOperation extends BlobUploadOperation { // eslint-disable-line
  static NAME = 'keyword-upload';
  static META_TYPE = 'keyword_neg';
  static CONTENT_TYPE = 'audio/wav';
}
