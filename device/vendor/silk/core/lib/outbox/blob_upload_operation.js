/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

import StreamOperation from './stream_operation';

import api from '../api';
import createLog from '../log';
import httpStream from '../streams/http';
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
    let putUrl = await api.blob.getPutUrl(
      this.constructor.META_TYPE,
      this.size,
      this.constructor.CONTENT_TYPE,
    );

    let writer = httpStream(putUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': this.size,
        'Content-Type': this.constructor.CONTENT_TYPE,
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
    let result = await super._write(path);
    if (!result.done) {
      return result;
    }

    let { putUrl } = this.destination;
    try {
      let url = await api.blob.ack(putUrl);
      await api.timeMeta.create(Object.assign(
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
      metadata: this.metadata
    };
  }
}

export class VideoUploadOp extends BlobUploadOperation {
  static NAME = 'video-upload';
  static META_TYPE = 'video';
  static CONTENT_TYPE = 'video/mp4';
}

export class PreviewUploadOp extends BlobUploadOperation {
  static NAME = 'preview-upload';
  static META_TYPE = 'preview';
  static CONTENT_TYPE = 'image/jpeg';
}
