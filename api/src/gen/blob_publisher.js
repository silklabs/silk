/**
 * Blob creation API(s)
 *
 * @flow
 */

import BaseClass from '../http_client';

export type AckInput = {
 url: string;
};

export type AckOutput = {
 url: string;
};

export type PutUrlInput = {
 contentLength: number;
 contentType: string;
};

export type PutUrlOutputPutHeaders = {
};

export type PutUrlOutput = {
 putUrl: string;
 putHeaders: PutUrlOutputPutHeaders;
};

export type PutBlobInput = {
};

export type PutBlobOutput = {
};

export default class BlobPublisher extends BaseClass {

  name: string = 'api-blob_publisher';
  prefix: string = '/v1/blob-publisher/';

  
  /**
  Acknowledge a blob upload

  @param Object payload of request
  */
  ack(payload: AckInput): Promise<AckOutput> {
    let method = 'post';
    let url = '/v1/blob-publisher/ack';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Get the blob put url

  @param String type (type) Type of blob. (video, etc...)
  @param Object payload of request
  */
  putUrl(type: string, payload: PutUrlInput): Promise<PutUrlOutput> {
    let method = 'post';
    let url = '/v1/blob-publisher/put-url/:type';
    // Perform url subtitutions:
    url = url.replace(':type', type);

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Put blob (only works for file blobs)

  @param String type (type) Type of blob.
  @param String id (id) Identifier for blob.
  @param Object payload of request
  */
  putBlob(type: string, id: string, payload: PutBlobInput): Promise<PutBlobOutput> {
    let method = 'put';
    let url = '/v1/blob-publisher/:type/:id';
    // Perform url subtitutions:
    url = url.replace(':type', type);
    url = url.replace(':id', id);

    return this._apiRequestWithBody(method, url, payload);
  }
}