/**
 * Crash report reading...
 *
 * @flow
 */

import BaseClass from '../http_client';

export type FindByIdInput = {
};

export type FindByIdOutput = {
 deviceId: string;
 timeStamp: string;
 type: string;
 url: string;
 id: string;
};

export type FindAllInput = {
 deviceId: ?string;
 type: ?string;
 startTimeStamp: ?string;
 endTimeStamp: ?string;
 limit: ?number;
};

export type FindAllOutput = {
};

export default class Crash extends BaseClass {

  name: string = 'api-crash';
  prefix: string = '/v1/crash/';

  
  /**
  Query metrics /w influxql

  @param String id (id) ID of the crash report to find
  @param Object payload of request
  */
  findById(id: string, payload: FindByIdInput): Promise<FindByIdOutput> {
    let method = 'post';
    let url = '/v1/crash/find/:id';
    // Perform url subtitutions:
    url = url.replace(':id', id);

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Query metrics /w influxql

  @param Object payload of request
  */
  findAll(payload: FindAllInput): Promise<FindAllOutput> {
    let method = 'post';
    let url = '/v1/crash/find_all';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }
}