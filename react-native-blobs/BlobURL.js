/**
 * @providesModule BlobURL
 * @flow
 */
'use strict';

const {NativeModules} = require('react-native');
const {SLKBlobManager} = NativeModules;

import type Blob from './Blob';

let BLOB_URL_PREFIX = null;
if (SLKBlobManager && typeof SLKBlobManager.blobUriScheme === 'string') {
  BLOB_URL_PREFIX = SLKBlobManager.blobUriScheme + ':';
  if (typeof SLKBlobManager.blobUriHost === 'string') {
    BLOB_URL_PREFIX += `//${SLKBlobManager.blobUriHost}/`;
  }
}

class URL {

  constructor() {
    throw new Error('Creating URL objects is not supported.');
  }

  static createObjectURL(blob: Blob) {
    if (BLOB_URL_PREFIX === null) {
      throw new Error('Cannot create URL for blob!');
    }
    return `${BLOB_URL_PREFIX}${blob.blobId}?offset=${blob.offset}&size=${blob.size}`;
  }

  static revokeObjectURL(url: string) {
    // Do nothing.
  }

}

module.exports = URL;
