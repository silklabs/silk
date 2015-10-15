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

const META_TYPE = 'video';
const CONTENT_TYPE = 'video/mp4';
const log = createLog('operation:video_upload_operation');

export default class VideoUploadOperation extends StreamOperation {
  static NAME = 'video-upload';

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
      META_TYPE,
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
