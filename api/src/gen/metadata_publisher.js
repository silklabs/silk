/**
 * Metadata Publishing for video/events
 *
 * @flow
 */

import BaseClass from '../http_client';

export type CreateInputData = {
};

export type CreateInput = {
 id: ?string;
 metaType: string;
 startUTC: number;
 endUTC: ?number;
 url: ?string;
 data: ?CreateInputData;
 deviceId: any;
};

export type CreateOutput = {
 id: string;
};

export type UpdateInputData = {
};

export type UpdateInput = {
 endUTC: ?number;
 data: ?UpdateInputData;
};

export type UpdateOutput = {
 id: string;
};

export default class MetadataPublisher extends BaseClass {

  name: string = 'api-metadata_publisher';
  prefix: string = '/v1/metadata-publisher/';

  
  /**
  Create metadata

  @param Object payload of request
  */
  create(payload: CreateInput): Promise<CreateOutput> {
    let method = 'post';
    let url = '/v1/metadata-publisher/create';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Update an existing metadata object

  @param String id (id) Id of the specific metadata entry to update
  @param Object payload of request
  */
  update(id: string, payload: UpdateInput): Promise<UpdateOutput> {
    let method = 'post';
    let url = '/v1/metadata-publisher/update/:id';
    // Perform url subtitutions:
    url = url.replace(':id', id);

    return this._apiRequestWithBody(method, url, payload);
  }
}