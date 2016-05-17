/**
 * Crash Report Publishing
 *
 * @flow
 */

import BaseClass from '../http_client';

export type CreateInput = {
 timeStamp: string;
 type: string;
 url: string;
};

export type CreateOutput = {
 id: string;
};

export default class CrashPublisher extends BaseClass {

  name: string = 'api-crash_publisher';
  prefix: string = '/v1/crash-publisher/';

  
  /**
  Create the crash metadata

  @param Object payload of request
  */
  create(payload: CreateInput): Promise<CreateOutput> {
    let method = 'post';
    let url = '/v1/crash-publisher/create';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }
}